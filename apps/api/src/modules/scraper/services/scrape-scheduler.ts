import { errorText } from '../../../common/errors';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { SCRAPER_HEARTBEAT_KEY, scraperRunHeartbeatKey } from '@repo/contracts';
import { AlertsChecker } from '../../accounts/alerts.checker';
import { retentionCutoff } from '../../activity/activity';
import { ruleHitsCutoff } from '../../catalog/matching/rule-hits';
import { PrismaService } from '../../../prisma/prisma.service';
import { createRedis } from '../../../redis';
import { IngestionService } from './ingestion.service';
import { dueChains } from './schedule';
import { ScheduleService } from './schedule.service';
import { ScraperService } from './scraper.service';

/** Як часто перевіряти, чи не настав час для наступного обходу (таймер в адмінці — з точністю до хвилини) */
const TICK_EVERY_MS = 60 * 1000;
/** Як часто прибирати: втрачені запуски, акції, сповіщення, старі події й сесії */
const MAINTAIN_EVERY_MS = 10 * 60 * 1000;
/**
 * RUNNING-запуск без heartbeat довше за це вважаємо втраченим (воркер парсера зник).
 * Більше за TTL heartbeat (900 с), який парсер оновлює з кожним товаром.
 */
export const LOST_RUN_MS = 20 * 60 * 1000;

/**
 * Планувальник збору: раз на intervalHours ставить повний обхід кожної увімкненої мережі
 * в чергу парсера; мережі з scrapeHourUtc (лише акції: Kaufland, PENNY, NORMA) — ще й
 * щодня одразу після цієї години (Kaufland — лише в понеділок і четвер, OFFER_WEEKDAYS). Увімкнення й інтервал змінює адмінка (ScheduleService,
 * Redis `scraper:schedule`); без збережених налаштувань — SCRAPE_SCHEDULE / SCRAPE_INTERVAL_HOURS.
 */
@Injectable()
export class ScrapeScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ScrapeScheduler.name);
  private readonly redis = createRedis();
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly scraper: ScraperService,
    private readonly ingestion: IngestionService,
    private readonly alerts: AlertsChecker,
    private readonly schedule: ScheduleService,
  ) {}

  onApplicationBootstrap() {
    void this.schedule.settings().then(
      (settings) =>
        this.logger.log(
          settings.enabled
            ? `Планувальник: повний обхід кожні ${settings.intervalHours} год`
            : 'Планувальник вимкнено (увімкніть в адмінці); завислі запуски все одно знімаються',
        ),
      (error) => this.logger.error(`Розклад: ${errorText(error)}`),
    );
    this.timers = [
      setInterval(() => void this.maintain(), MAINTAIN_EVERY_MS),
      setInterval(() => void this.tick(), TICK_EVERY_MS),
    ];
    void this.maintain().then(() => this.tick());
  }

  onModuleDestroy() {
    this.timers.forEach(clearInterval);
    this.redis.disconnect();
  }

  /** Кожні 10 хв: зняти втрачені запуски й акції, що закінчились, сповіщення за підписками, події старші за 180 днів і прострочені сесії */
  async maintain(now = new Date()): Promise<void> {
    await this.reapLostRuns(now);
    await this.ingestion
      .expirePromos(now)
      .catch((error) =>
        this.logger.error(`Закінчення акцій: ${errorText(error)}`),
      );
    await this.alerts
      .check()
      .catch((error) =>
        this.logger.error(`Сповіщення за підписками: ${errorText(error)}`),
      );
    await this.prisma.event
      .deleteMany({ where: { createdAt: { lt: retentionCutoff(now) } } })
      .catch((error) =>
        this.logger.error(`Видалення старих подій: ${errorText(error)}`),
      );
    // Прострочені сесії (вхід інакше чистить лише сесії того, хто знову увійшов)
    await this.prisma.session
      .deleteMany({ where: { expiresAt: { lte: now } } })
      .catch((error) =>
        this.logger.error(`Видалення сесій: ${errorText(error)}`),
      );
    await this.prisma.matchRuleHit
      .deleteMany({ where: { createdAt: { lt: ruleHitsCutoff(now) } } })
      .catch((error) =>
        this.logger.error(`Видалення спрацювань правил: ${errorText(error)}`),
      );
  }

  /** RUNNING-запуски без heartbeat парсера → FAILED, щоб не висіли й не блокували мережу */
  async reapLostRuns(now = new Date()): Promise<string[]> {
    try {
      const runs = await this.prisma.scrapeRun.findMany({
        where: {
          status: 'RUNNING',
          startedAt: { lt: new Date(now.getTime() - LOST_RUN_MS) },
        },
        select: { id: true },
      });
      if (runs.length === 0) return [];
      // Спільний ключ лишаємо для образу парсера без ключів на запуск
      const latest = await this.redis.get(SCRAPER_HEARTBEAT_KEY);
      const beats = await Promise.all(
        runs.map((r) => this.redis.exists(scraperRunHeartbeatKey(r.id))),
      );
      const lost = runs
        .filter((r, i) => r.id !== latest && beats[i] === 0)
        .map((r) => r.id);
      if (lost.length === 0) return [];
      await this.prisma.scrapeRun.updateMany({
        where: { id: { in: lost }, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          finishedAt: now,
          error: 'Воркер парсера не подає ознак життя (heartbeat)',
        },
      });
      this.logger.warn(`Втрачені запуски → FAILED: ${lost.join(', ')}`);
      return lost;
    } catch (error) {
      this.logger.error(`Перевірка завислих запусків: ${errorText(error)}`);
      return [];
    }
  }

  /** Щохвилини: поставити в чергу мережі, яким за розкладом пора */
  async tick(now = new Date()): Promise<string[]> {
    try {
      const settings = await this.schedule.settings();
      if (!settings.enabled) return [];
      const due = dueChains(
        await this.schedule.chains(settings),
        now,
        settings.intervalHours * 60 * 60 * 1000,
        settings,
      );
      for (const slug of due) {
        await this.scraper.triggerScrape(slug, undefined, 'cron');
      }
      if (due.length > 0)
        this.logger.log(`Заплановано обхід: ${due.join(', ')}`);
      return due;
    } catch (error) {
      this.logger.error(`Планувальник: ${errorText(error)}`);
      return [];
    }
  }
}

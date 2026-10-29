import { errorText } from '../../../common/errors';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { SCRAPER_HEARTBEAT_KEY } from '@repo/contracts';
import { AlertsChecker } from '../../accounts/alerts.checker';
import { retentionCutoff } from '../../activity/activity';
import { PrismaService } from '../../../prisma/prisma.service';
import { createRedis } from '../../../redis';
import { IngestionService } from './ingestion.service';
import { ScraperService } from './scraper.service';

/** Як часто перевіряти, чи не настав час для наступного обходу */
const CHECK_EVERY_MS = 10 * 60 * 1000;
/**
 * Запуск, що "висить" довше, вважаємо втраченим (воркер падав посеред обходу).
 * Повний обхід усіх мереж одним воркером триває години, тож поріг великий.
 */
const MIN_STALE_RUN_MS = 48 * 60 * 60 * 1000;
/**
 * RUNNING-запуск без heartbeat довше за це вважаємо втраченим (воркер парсера зник).
 * Більше за TTL heartbeat (900 с), який парсер оновлює з кожним товаром.
 */
export const LOST_RUN_MS = 20 * 60 * 1000;

export interface ChainSchedule {
  slug: string;
  lastRun: { startedAt: Date; status: string } | null;
  /** Щоденний обхід після цієї години UTC (мережі лише з акціями); null — лише інтервал */
  scrapeHourUtc?: number | null;
}

/** Остання щоденна межа `hour`:00 UTC, що вже настала */
export function lastDailyBoundary(now: Date, hour: number): Date {
  const boundary = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour),
  );
  if (boundary > now) boundary.setUTCDate(boundary.getUTCDate() - 1);
  return boundary;
}

/**
 * Мережі, яким пора на повний обхід: останній запуск був давніше за інтервал (або до
 * останньої щоденної межі для мереж з scrapeHourUtc) і жоден запуск цієї мережі зараз
 * не чекає в черзі й не виконується.
 */
export function dueChains(
  chains: ChainSchedule[],
  now: Date,
  intervalMs: number,
): string[] {
  return chains
    .filter(({ lastRun, scrapeHourUtc }) => {
      if (!lastRun) return true;
      const age = now.getTime() - lastRun.startedAt.getTime();
      const active =
        lastRun.status === 'QUEUED' || lastRun.status === 'RUNNING';
      if (active) return age > Math.max(2 * intervalMs, MIN_STALE_RUN_MS);
      const daily =
        scrapeHourUtc != null &&
        lastRun.startedAt < lastDailyBoundary(now, scrapeHourUtc);
      return daily || age >= intervalMs;
    })
    .map((chain) => chain.slug);
}

/**
 * Планувальник збору: раз на SCRAPE_INTERVAL_HOURS (за замовчуванням 24 год) ставить
 * повний обхід кожної увімкненої мережі в чергу парсера; мережі з scrapeHourUtc (лише
 * акції: Kaufland, PENNY, NORMA) — ще й щодня одразу після цієї години. Вмикається SCRAPE_SCHEDULE=true,
 * щоб під час розробки сайти мереж не обходилися без потреби.
 */
@Injectable()
export class ScrapeScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ScrapeScheduler.name);
  private readonly redis = createRedis();
  private timer?: NodeJS.Timeout;
  private enabled = false;
  private intervalMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scraper: ScraperService,
    private readonly ingestion: IngestionService,
    private readonly alerts: AlertsChecker,
  ) {}

  onApplicationBootstrap() {
    this.enabled = process.env.SCRAPE_SCHEDULE === 'true';
    const hours = Number(process.env.SCRAPE_INTERVAL_HOURS);
    if (Number.isFinite(hours) && hours > 0)
      this.intervalMs = hours * 60 * 60 * 1000;
    this.logger.log(
      this.enabled
        ? `Планувальник: повний обхід кожні ${this.intervalMs / 3_600_000} год`
        : 'Планувальник вимкнено (SCRAPE_SCHEDULE=true, щоб увімкнути); завислі запуски все одно знімаються',
    );
    this.timer = setInterval(() => void this.maintain(), CHECK_EVERY_MS);
    void this.maintain();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.redis.disconnect();
  }

  /** Кожні 10 хв: зняти втрачені запуски й акції, що закінчились, сповіщення за підписками, події старші за 180 днів і прострочені сесії, далі — заплановані обходи */
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
    if (this.enabled) await this.tick(now);
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
      const alive = await this.redis.get(SCRAPER_HEARTBEAT_KEY);
      const lost = runs.map((r) => r.id).filter((id) => id !== alive);
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

  async tick(now = new Date()): Promise<string[]> {
    try {
      const chains = await this.prisma.storeChain.findMany({
        where: { scrapeEnabled: true },
        select: {
          slug: true,
          scrapeHourUtc: true,
          scrapeRuns: {
            orderBy: { startedAt: 'desc' },
            take: 1,
            select: { startedAt: true, status: true },
          },
        },
      });
      const due = dueChains(
        chains.map((c) => ({
          slug: c.slug,
          scrapeHourUtc: c.scrapeHourUtc,
          lastRun: c.scrapeRuns[0] ?? null,
        })),
        now,
        this.intervalMs,
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

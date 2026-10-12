import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ScraperService } from './scraper.service';

/** Як часто перевіряти, чи не настав час для наступного обходу */
const CHECK_EVERY_MS = 10 * 60 * 1000;
/**
 * Запуск, що "висить" довше, вважаємо втраченим (воркер падав посеред обходу).
 * Повний обхід усіх мереж одним воркером триває години, тож поріг великий.
 */
const MIN_STALE_RUN_MS = 48 * 60 * 60 * 1000;

export interface ChainSchedule {
  slug: string;
  lastRun: { startedAt: Date; status: string } | null;
}

/**
 * Мережі, яким пора на повний обхід: останній запуск був давніше за інтервал
 * і жоден запуск цієї мережі зараз не чекає в черзі й не виконується.
 */
export function dueChains(
  chains: ChainSchedule[],
  now: Date,
  intervalMs: number,
): string[] {
  return chains
    .filter(({ lastRun }) => {
      if (!lastRun) return true;
      const age = now.getTime() - lastRun.startedAt.getTime();
      const active =
        lastRun.status === 'QUEUED' || lastRun.status === 'RUNNING';
      if (active) return age > Math.max(2 * intervalMs, MIN_STALE_RUN_MS);
      return age >= intervalMs;
    })
    .map((chain) => chain.slug);
}

/**
 * Планувальник збору: раз на SCRAPE_INTERVAL_HOURS (за замовчуванням 24 год) ставить
 * повний обхід кожної увімкненої мережі в чергу парсера. Вмикається SCRAPE_SCHEDULE=true,
 * щоб під час розробки сайти мереж не обходилися без потреби.
 */
@Injectable()
export class ScrapeScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ScrapeScheduler.name);
  private timer?: NodeJS.Timeout;
  private intervalMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scraper: ScraperService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.SCRAPE_SCHEDULE !== 'true') {
      this.logger.log(
        'Планувальник вимкнено (SCRAPE_SCHEDULE=true, щоб увімкнути)',
      );
      return;
    }
    const hours = Number(process.env.SCRAPE_INTERVAL_HOURS);
    if (Number.isFinite(hours) && hours > 0)
      this.intervalMs = hours * 60 * 60 * 1000;
    this.logger.log(
      `Планувальник: повний обхід кожні ${this.intervalMs / 3_600_000} год`,
    );
    this.timer = setInterval(() => void this.tick(), CHECK_EVERY_MS);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<string[]> {
    try {
      const chains = await this.prisma.storeChain.findMany({
        where: { scrapeEnabled: true },
        select: {
          slug: true,
          scrapeRuns: {
            orderBy: { startedAt: 'desc' },
            take: 1,
            select: { startedAt: true, status: true },
          },
        },
      });
      const due = dueChains(
        chains.map((c) => ({ slug: c.slug, lastRun: c.scrapeRuns[0] ?? null })),
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
      this.logger.error(`Планувальник: ${String(error)}`);
      return [];
    }
  }
}

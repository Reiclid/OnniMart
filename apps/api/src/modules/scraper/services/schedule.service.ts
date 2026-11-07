import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { errorText } from '../../../common/errors';
import { PrismaService } from '../../../prisma/prisma.service';
import { createRedis } from '../../../redis';
import {
  RunAllResponseDto,
  ScheduleDto,
  UpdateScheduleDto,
} from '../dto/schedule.dto';
import {
  ChainSchedule,
  OFFER_WEEKDAYS,
  defaultSettings,
  isActive,
  nextDueAt,
  parseSettings,
  ScheduleSettings,
} from './schedule';
import { ScraperService } from './scraper.service';

/** Налаштування планувальника: пише API (адмінка), читає воркер перед кожною перевіркою */
export const SCRAPER_SCHEDULE_KEY = 'scraper:schedule';

const HOUR = 60 * 60 * 1000;

/** Розклад обходів: налаштування, таймер наступного обходу, "Запустити зараз" */
@Injectable()
export class ScheduleService implements OnModuleDestroy {
  private readonly logger = new Logger(ScheduleService.name);
  private readonly redis = createRedis();

  constructor(
    private readonly prisma: PrismaService,
    private readonly scraper: ScraperService,
  ) {}

  onModuleDestroy() {
    this.redis.disconnect();
  }

  async settings(): Promise<ScheduleSettings> {
    return parseSettings(
      await this.redis.get(SCRAPER_SCHEDULE_KEY),
      defaultSettings(process.env),
    );
  }

  async update(patch: UpdateScheduleDto): Promise<ScheduleDto> {
    const current = await this.settings();
    const next = { ...current, ...patch };
    // Новий розклад діє наперед: слот, що вже минув, не запускає обхід усіх мереж одразу
    if (
      next.startTime !== current.startTime ||
      next.utcOffset !== current.utcOffset ||
      next.intervalHours !== current.intervalHours
    )
      next.startTimeSetAt = new Date().toISOString();
    await this.redis.set(SCRAPER_SCHEDULE_KEY, JSON.stringify(next));
    this.logger.log(`Розклад: ${JSON.stringify(next)}`);
    return this.status();
  }

  /** Увімкнені мережі з даними для розкладу (базовий запуск — за manualResetsTimer) */
  async chains(
    settings: ScheduleSettings,
  ): Promise<(ChainSchedule & { name: string })[]> {
    const chains = await this.prisma.storeChain.findMany({
      where: { scrapeEnabled: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        scrapeHourUtc: true,
        scrapeRuns: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { startedAt: true, status: true },
        },
      },
    });
    const cron = settings.manualResetsTimer
      ? null
      : new Map(
          (
            await this.prisma.scrapeRun.groupBy({
              by: ['chainId'],
              where: { trigger: 'cron' },
              _max: { startedAt: true },
            })
          ).map((row) => [row.chainId, row._max.startedAt]),
        );
    return chains.map((chain) => {
      const started = cron?.get(chain.id);
      return {
        slug: chain.slug,
        name: chain.name,
        scrapeHourUtc: chain.scrapeHourUtc,
        scrapeWeekdays: OFFER_WEEKDAYS[chain.slug] ?? null,
        lastRun: chain.scrapeRuns[0] ?? null,
        ...(cron && { basis: started ? { startedAt: started } : null }),
      };
    });
  }

  async status(now = new Date()): Promise<ScheduleDto> {
    const settings = await this.settings();
    const intervalMs = settings.intervalHours * HOUR;
    const chains = (await this.chains(settings)).map((chain) => ({
      slug: chain.slug,
      name: chain.name,
      // Прострочене (воркер ще не перевірив або вимкнений) показуємо як "зараз"
      nextRunAt: new Date(
        Math.max(
          nextDueAt(chain, intervalMs, settings).getTime(),
          now.getTime(),
        ),
      ).toISOString(),
      active: isActive(chain.lastRun),
    }));
    const upcoming = chains
      .filter((chain) => !chain.active)
      .map((chain) => chain.nextRunAt)
      .sort();
    return {
      enabled: settings.enabled,
      intervalHours: settings.intervalHours,
      manualResetsTimer: settings.manualResetsTimer,
      startTime: settings.startTime,
      utcOffset: settings.utcOffset,
      nextRunAt: settings.enabled ? (upcoming[0] ?? null) : null,
      activeRuns: chains.filter((chain) => chain.active).length,
      chains,
    };
  }

  /** Повний обхід усіх увімкнених мереж зараз; ті, що вже в черзі чи обходяться, пропускаємо */
  async runAll(): Promise<RunAllResponseDto> {
    const chains = await this.chains(await this.settings());
    const queued: string[] = [];
    const skipped: string[] = [];
    for (const chain of chains) {
      if (isActive(chain.lastRun)) {
        skipped.push(chain.slug);
        continue;
      }
      try {
        await this.scraper.triggerScrape(chain.slug);
        queued.push(chain.slug);
      } catch (error) {
        // Інша вкладка встигла поставити ту саму мережу (409) — не зриваємо решту
        this.logger.warn(`${chain.slug}: ${errorText(error)}`);
        skipped.push(chain.slug);
      }
    }
    this.logger.log(`Запустити зараз: ${queued.length} мереж у черзі`);
    return { queued, skipped };
  }
}

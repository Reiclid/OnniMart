import type { AlertsChecker } from '../../accounts/alerts.checker';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ScrapeScheduler } from './scrape-scheduler';
import {
  defaultSettings,
  dueChains,
  lastDailyBoundary,
  nextDueAt,
  parseSettings,
} from './schedule';
import { ScheduleService } from './schedule.service';
import { IngestionService } from './ingestion.service';
import { ScraperService } from './scraper.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-12T03:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('dueChains', () => {
  it('запускає мережі без запусків і ті, що обходились давніше за інтервал', () => {
    const due = dueChains(
      [
        { slug: 'never', lastRun: null },
        {
          slug: 'old',
          lastRun: { startedAt: ago(DAY + 1), status: 'SUCCESS' },
        },
        {
          slug: 'fresh',
          lastRun: { startedAt: ago(DAY / 2), status: 'SUCCESS' },
        },
        {
          slug: 'failed',
          lastRun: { startedAt: ago(2 * DAY), status: 'FAILED' },
        },
      ],
      NOW,
      DAY,
    );
    expect(due).toEqual(['never', 'old', 'failed']);
  });

  it('не дублює запуск, що ще в черзі або виконується', () => {
    const due = dueChains(
      [
        {
          slug: 'queued',
          lastRun: { startedAt: ago(DAY + 1), status: 'QUEUED' },
        },
        {
          slug: 'running',
          lastRun: { startedAt: ago(DAY / 4), status: 'RUNNING' },
        },
        // Воркер перезапускався, запуск "завис" — повторюємо
        {
          slug: 'stale',
          lastRun: { startedAt: ago(5 * DAY), status: 'RUNNING' },
        },
      ],
      NOW,
      2 * DAY,
    );
    expect(due).toEqual(['stale']);
  });
});

describe('щоденний обхід мереж з акціями (scrapeHourUtc)', () => {
  it('остання межа: сьогодні, якщо година вже настала, інакше вчора', () => {
    expect(lastDailyBoundary(NOW, 2).toISOString()).toBe(
      '2026-10-12T02:00:00.000Z',
    );
    expect(lastDailyBoundary(NOW, 4).toISOString()).toBe(
      '2026-10-11T04:00:00.000Z',
    );
  });

  it('запуск до межі → пора, хоч інтервал ще не минув; після межі — ні', () => {
    const due = dueChains(
      [
        {
          slug: 'kaufland-de',
          scrapeHourUtc: 4,
          // 11.10 о 03:00 — до межі 11.10 04:00
          lastRun: { startedAt: ago(DAY), status: 'SUCCESS' },
        },
        {
          slug: 'penny-de',
          scrapeHourUtc: 4,
          // 11.10 о 05:00 — після межі, наступна лише 12.10 04:00
          lastRun: { startedAt: ago(22 * 60 * 60 * 1000), status: 'SUCCESS' },
        },
        {
          slug: 'norma-de',
          scrapeHourUtc: 4,
          lastRun: { startedAt: ago(DAY), status: 'RUNNING' },
        },
        {
          slug: 'silpo',
          scrapeHourUtc: null,
          lastRun: { startedAt: ago(DAY), status: 'SUCCESS' },
        },
      ],
      NOW,
      3 * DAY,
    );
    expect(due).toEqual(['kaufland-de']);
  });
});

describe('ручний запуск і таймер (basis)', () => {
  const manual = { startedAt: ago(DAY / 2), status: 'SUCCESS' };

  it('manualResetsTimer: таймер від ручного запуску', () => {
    expect(
      nextDueAt({ slug: 'silpo', lastRun: manual }, DAY).toISOString(),
    ).toBe('2026-10-12T15:00:00.000Z');
  });

  it('інакше — від останнього планового; без планових — одразу', () => {
    const chains = [
      { slug: 'cron-old', lastRun: manual, basis: { startedAt: ago(DAY) } },
      { slug: 'never-cron', lastRun: manual, basis: null },
      {
        slug: 'cron-fresh',
        lastRun: manual,
        basis: { startedAt: ago(DAY / 3) },
      },
    ];
    expect(dueChains(chains, NOW, DAY)).toEqual(['cron-old', 'never-cron']);
  });
});

describe('налаштування розкладу', () => {
  const defaults = defaultSettings({
    SCRAPE_SCHEDULE: 'true',
    SCRAPE_INTERVAL_HOURS: '12',
  });

  it('без збережених — з оточення', () => {
    expect(defaults).toEqual({
      enabled: true,
      intervalHours: 12,
      manualResetsTimer: true,
    });
    expect(parseSettings(null, defaults)).toEqual(defaults);
    expect(parseSettings('{битий', defaults)).toEqual(defaults);
  });

  it('збережені поля поверх типових, неправильні ігноруємо', () => {
    expect(
      parseSettings(
        JSON.stringify({
          enabled: false,
          intervalHours: 0,
          manualResetsTimer: 'так',
        }),
        defaults,
      ),
    ).toEqual({ enabled: false, intervalHours: 12, manualResetsTimer: true });
    expect(parseSettings('{"intervalHours":6}', defaults).intervalHours).toBe(
      6,
    );
  });
});

describe('ScrapeScheduler.tick', () => {
  beforeAll(() => Logger.overrideLogger(false));

  function setup(enabled: boolean) {
    const schedule = {
      settings: jest.fn(() =>
        Promise.resolve({
          enabled,
          intervalHours: 24,
          manualResetsTimer: true,
        }),
      ),
      chains: jest.fn(() =>
        Promise.resolve([
          { slug: 'silpo', lastRun: null },
          {
            slug: 'novus',
            lastRun: { startedAt: ago(DAY / 2), status: 'SUCCESS' },
          },
        ]),
      ),
    };
    const scraper = { triggerScrape: jest.fn(() => Promise.resolve({})) };
    const scheduler = new ScrapeScheduler(
      {} as PrismaService,
      scraper as unknown as ScraperService,
      {} as IngestionService,
      {} as AlertsChecker,
      schedule as unknown as ScheduleService,
    );
    return { scheduler, scraper };
  }

  it('ставить у чергу лише мережі, яким пора', async () => {
    const { scheduler, scraper } = setup(true);
    await expect(scheduler.tick(NOW)).resolves.toEqual(['silpo']);
    expect(scraper.triggerScrape).toHaveBeenCalledWith(
      'silpo',
      undefined,
      'cron',
    );
  });

  it('розклад вимкнено в адмінці — нічого не ставить', async () => {
    const { scheduler, scraper } = setup(false);
    await expect(scheduler.tick(NOW)).resolves.toEqual([]);
    expect(scraper.triggerScrape).not.toHaveBeenCalled();
  });
});

describe('ScrapeScheduler.reapLostRuns', () => {
  beforeAll(() => Logger.overrideLogger(false));

  function setup(heartbeat: string | null) {
    const prisma = {
      scrapeRun: {
        findMany: jest.fn(() =>
          Promise.resolve([{ id: 'run-a' }, { id: 'run-b' }]),
        ),
        updateMany: jest.fn((_args: unknown) => Promise.resolve({ count: 1 })),
      },
    };
    const scheduler = new ScrapeScheduler(
      prisma as unknown as PrismaService,
      {} as ScraperService,
      {} as IngestionService,
      {} as AlertsChecker,
      {} as ScheduleService,
    );
    Object.assign(scheduler, {
      redis: { get: jest.fn(() => Promise.resolve(heartbeat)) },
    });
    return { scheduler, prisma };
  }

  it('позначає FAILED запуски без heartbeat, живий не чіпає', async () => {
    const { scheduler, prisma } = setup('run-b');
    await expect(scheduler.reapLostRuns(NOW)).resolves.toEqual(['run-a']);
    expect(prisma.scrapeRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['run-a'] }, status: 'RUNNING' },
      }),
    );
  });

  it('heartbeat немає — втрачені всі старі RUNNING', async () => {
    const { scheduler } = setup(null);
    await expect(scheduler.reapLostRuns(NOW)).resolves.toEqual([
      'run-a',
      'run-b',
    ]);
  });
});

import type { AlertsChecker } from '../../accounts/alerts.checker';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ScrapeScheduler } from './scrape-scheduler';
import {
  defaultSettings,
  dueChains,
  nextBoundaryAfter,
  nextDueAt,
  nextSlot,
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
  it('перша межа після моменту: сьогодні, якщо година ще не настала, інакше завтра', () => {
    expect(nextBoundaryAfter(NOW, 4).toISOString()).toBe(
      '2026-10-12T04:00:00.000Z',
    );
    expect(nextBoundaryAfter(NOW, 2).toISOString()).toBe(
      '2026-10-13T02:00:00.000Z',
    );
    // рівно на межі — строго після неї
    expect(nextBoundaryAfter(new Date('2026-10-12T04:00:00Z'), 4)).toEqual(
      new Date('2026-10-13T04:00:00Z'),
    );
  });

  it('межа з днями тижня: пн+чт, перехід через тиждень, година ще не настала', () => {
    const next = (iso: string) =>
      nextBoundaryAfter(new Date(iso), 4, [1, 4]).toISOString();
    // 12.10.2026 — понеділок
    expect(next('2026-10-12T03:00:00Z')).toBe('2026-10-12T04:00:00.000Z');
    expect(next('2026-10-12T05:00:00Z')).toBe('2026-10-15T04:00:00.000Z');
    expect(next('2026-10-15T05:00:00Z')).toBe('2026-10-19T04:00:00.000Z');
    expect(next('2026-10-17T12:00:00Z')).toBe('2026-10-19T04:00:00.000Z');
  });

  describe('Kaufland: лише понеділок і четвер', () => {
    const kaufland = (startedAt: string, status = 'SUCCESS') => ({
      slug: 'kaufland-de',
      scrapeHourUtc: 4,
      scrapeWeekdays: [1, 4],
      lastRun: { startedAt: new Date(startedAt), status },
    });
    const due = (c: ReturnType<typeof kaufland>, at: string) =>
      dueChains([c], new Date(at), DAY).length === 1;

    it('після запуску в понеділок у вівторок не пора, у четвер — пора', () => {
      const c = kaufland('2026-10-12T05:00:00Z');
      expect(due(c, '2026-10-13T12:00:00Z')).toBe(false);
      expect(due(c, '2026-10-15T03:00:00Z')).toBe(false);
      expect(due(c, '2026-10-15T04:00:00Z')).toBe(true);
    });

    it('після запуску в четвер наступний — понеділок', () => {
      const c = kaufland('2026-10-15T05:00:00Z');
      expect(due(c, '2026-10-18T12:00:00Z')).toBe(false);
      expect(due(c, '2026-10-19T04:00:00Z')).toBe(true);
    });

    it('довга перерва: пора одразу', () => {
      expect(
        due(kaufland('2026-09-01T05:00:00Z'), '2026-10-13T12:00:00Z'),
      ).toBe(true);
    });

    it('невдалий запуск повторюється через інтервал', () => {
      const c = kaufland('2026-10-12T05:00:00Z', 'FAILED');
      expect(due(c, '2026-10-13T04:00:00Z')).toBe(false);
      expect(due(c, '2026-10-13T05:00:00Z')).toBe(true);
    });

    it('без запусків — одразу', () => {
      expect(
        nextDueAt({ ...kaufland('2026-10-12T05:00:00Z'), lastRun: null }, DAY),
      ).toEqual(new Date(0));
    });

    it('PENNY без днів тижня лишається щоденним', () => {
      const penny = {
        slug: 'penny-de',
        scrapeHourUtc: 4,
        lastRun: {
          startedAt: new Date('2026-10-12T05:00:00Z'),
          status: 'SUCCESS',
        },
      };
      expect(nextDueAt(penny, 7 * DAY)).toEqual(
        new Date('2026-10-13T04:00:00Z'),
      );
    });
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

describe('обхід у заданий час', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const time = { startTime: '03:00', utcOffset: 2, startTimeSetAt: null };
  const at = (day: number, hour: number, minute = 0) =>
    new Date(Date.UTC(2026, 10, day, hour, minute));
  const chain = (startedAt: Date) => ({
    slug: 'silpo',
    lastRun: { startedAt, status: 'SUCCESS' },
  });

  it('час у вибраному поясі: 03:00 UTC+2 — це 01:00 UTC', () => {
    const noon = at(3, 12).getTime();
    expect(nextSlot('03:00', 2, DAY, noon)).toBe(at(4, 1).getTime());
    expect(nextSlot('03:00', 0, DAY, noon)).toBe(at(4, 3).getTime());
  });

  it('період — крок від заданого часу', () => {
    const noon = at(3, 12).getTime();
    expect(nextSlot('03:00', 2, DAY / 2, noon)).toBe(at(3, 13).getTime());
    // 48 год: сітка фіксована, час доби той самий
    expect(new Date(nextSlot('03:00', 2, 2 * DAY, noon)).getUTCHours()).toBe(1);
  });

  it('плановий обхід — наступний слот, а не той самий', () => {
    expect(nextDueAt(chain(at(3, 1, 1)), DAY, time)).toEqual(at(4, 1));
  });

  it('ручний запуск перед слотом замінює його', () => {
    expect(nextDueAt(chain(at(3, 0, 50)), DAY, time)).toEqual(at(4, 1));
  });

  it('ручний запуск не скидає таймер (basis): слот залишається', () => {
    const run = { ...chain(at(3, 0, 50)), basis: { startedAt: at(2, 1, 1) } };
    expect(nextDueAt(run, DAY, time)).toEqual(at(3, 1));
  });

  it('новий час не запускає пропущений слот одразу', () => {
    const set = { ...time, startTimeSetAt: at(3, 20).toISOString() };
    const old = chain(at(2, 9));
    expect(nextDueAt(old, DAY, set)).toEqual(at(4, 1));
    expect(dueChains([old], at(3, 20, 1), DAY, set)).toEqual([]);
    expect(dueChains([old], at(4, 1), DAY, set)).toEqual(['silpo']);
  });

  it('мережа без запусків чекає на заданий час', () => {
    const set = { ...time, startTimeSetAt: at(3, 20).toISOString() };
    const fresh = { slug: 'novus', lastRun: null };
    expect(nextDueAt(fresh, DAY, set)).toEqual(at(4, 1));
  });

  it('щоденний обхід акцій лишається раніше за довгий період', () => {
    const offers = { ...chain(at(3, 7)), scrapeHourUtc: 6 };
    expect(nextDueAt(offers, 7 * DAY, time)).toEqual(at(4, 6));
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
      startTime: null,
      utcOffset: 2,
      startTimeSetAt: null,
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
    ).toEqual({ ...defaults, enabled: false });
    expect(
      parseSettings('{"startTime":"25:00","utcOffset":5}', defaults),
    ).toEqual(defaults);
    expect(
      parseSettings('{"startTime":"03:30","utcOffset":0}', defaults),
    ).toMatchObject({ startTime: '03:30', utcOffset: 0 });
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

  function setup(heartbeat: string | null, running?: string) {
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
      redis: {
        get: jest.fn(() => Promise.resolve(heartbeat)),
        exists: jest.fn((key: string) =>
          Promise.resolve(key === `scraper:heartbeat:${running}` ? 1 : 0),
        ),
      },
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

  it('одночасні обходи: запуск із власним ключем живий', async () => {
    const { scheduler, prisma } = setup('run-b', 'run-a');
    await expect(scheduler.reapLostRuns(NOW)).resolves.toEqual([]);
    expect(prisma.scrapeRun.updateMany).not.toHaveBeenCalled();
  });

  it('heartbeat немає — втрачені всі старі RUNNING', async () => {
    const { scheduler } = setup(null);
    await expect(scheduler.reapLostRuns(NOW)).resolves.toEqual([
      'run-a',
      'run-b',
    ]);
  });
});

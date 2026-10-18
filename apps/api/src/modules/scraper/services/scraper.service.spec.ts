import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SCRAPER_TASKS_QUEUE } from '@repo/contracts';
import { ScraperService } from './scraper.service';

type Args = any;

const CHAINS: Record<string, object> = {
  silpo: {
    id: 'chain-silpo',
    slug: 'silpo',
    name: 'Сільпо',
    scrapeEnabled: true,
    crawlDelayMs: 3000,
  },
  atb: { id: 'chain-atb', slug: 'atb', name: 'АТБ', scrapeEnabled: false },
};

describe('ScraperService', () => {
  let prisma: {
    storeChain: { findUnique: jest.Mock };
    scrapeRun: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let redis: { lpush: jest.Mock; disconnect: jest.Mock };
  let service: ScraperService;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    prisma = {
      storeChain: {
        findUnique: jest.fn((args: Args) =>
          Promise.resolve(CHAINS[args.where.slug] ?? null),
        ),
      },
      scrapeRun: {
        create: jest.fn((_args: Args) => Promise.resolve({ id: 'run-1' })),
        findFirst: jest.fn((_args: Args) => Promise.resolve(null)),
        update: jest.fn((_args: Args) => Promise.resolve({})),
      },
    };
    redis = { lpush: jest.fn(() => Promise.resolve(1)), disconnect: jest.fn() };
    service = new ScraperService(prisma as unknown as PrismaService);
    // Підміняємо Redis, щоб тест не потребував сервера
    Object.assign(service, { redis });
  });

  it('створює запуск і кладе завдання в чергу', async () => {
    await expect(service.triggerScrape('silpo', 2)).resolves.toMatchObject({
      status: 'queued',
      runId: 'run-1',
    });

    expect(prisma.scrapeRun.create).toHaveBeenCalledWith({
      data: { chainId: 'chain-silpo', trigger: 'manual' },
    });
    const [queue, payload] = redis.lpush.mock.calls[0] as [string, string];
    expect(queue).toBe(SCRAPER_TASKS_QUEUE);
    expect(JSON.parse(payload)).toMatchObject({
      run_id: 'run-1',
      store: 'silpo',
      max_pages: 2,
      crawl_delay_ms: 3000,
    });
  });

  it('без обмеження сторінок передає max_pages: null', async () => {
    await service.triggerScrape('silpo');
    const payload = JSON.parse(redis.lpush.mock.calls[0][1] as string);
    expect(payload.max_pages).toBeNull();
  });

  it('відмовляє для невідомої або вимкненої мережі', async () => {
    await expect(service.triggerScrape('rewe-de')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.triggerScrape('atb')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(redis.lpush).not.toHaveBeenCalled();
  });

  it('перевіряє maxPages', async () => {
    await expect(service.triggerScrape('silpo', 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.triggerScrape('silpo', 1.5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.scrapeRun.create).not.toHaveBeenCalled();
  });

  it('не ставить другий запуск, поки мережа в черзі або обходиться', async () => {
    prisma.scrapeRun.findFirst.mockResolvedValueOnce({ id: 'run-0' });
    await expect(service.triggerScrape('silpo')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.scrapeRun.create).not.toHaveBeenCalled();
  });

  it('Redis недоступний — запуск позначається FAILED, а не висить QUEUED', async () => {
    redis.lpush.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.triggerScrape('silpo')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.scrapeRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
});

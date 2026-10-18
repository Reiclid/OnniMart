import { Logger } from '@nestjs/common';
import {
  SCRAPER_RESULTS_DEAD,
  SCRAPER_RESULTS_PROCESSING,
  SCRAPER_RESULTS_QUEUE,
} from '@repo/contracts';
import { IngestionService } from './ingestion.service';
import { IngestionWorker, MAX_ATTEMPTS } from './ingestion.worker';

/** Redis-списки в памʼяті: LPUSH додає зліва, RIGHT — найстаріший елемент */
function fakeRedis() {
  const lists = new Map<string, string[]>();
  const list = (key: string) => {
    if (!lists.has(key)) lists.set(key, []);
    return lists.get(key)!;
  };
  const redis = {
    lists,
    lindex: (key: string, i: number) =>
      Promise.resolve(list(key).at(i) ?? null),
    blmove: (from: string, to: string) => {
      const value = list(from).pop() ?? null;
      if (value !== null) list(to).unshift(value);
      return Promise.resolve(value);
    },
    lrem: (key: string, _count: number, value: string) => {
      const items = list(key);
      const i = items.lastIndexOf(value);
      if (i >= 0) items.splice(i, 1);
      return Promise.resolve(i >= 0 ? 1 : 0);
    },
    lpush: (key: string, value: string) => list(key).unshift(value),
    multi() {
      const ops: (() => unknown)[] = [];
      const tx = {
        lpush: (key: string, value: string) => {
          ops.push(() => redis.lpush(key, value));
          return tx;
        },
        lrem: (key: string, count: number, value: string) => {
          ops.push(() => redis.lrem(key, count, value));
          return tx;
        },
        exec: () => Promise.resolve(ops.map((op) => op())),
      };
      return tx;
    },
  };
  return redis;
}

const product = JSON.stringify({
  kind: 'product',
  store: 'novus',
  external: '1',
  name: 'Coca-Cola 0,5 л',
  price: 29.9,
  scraper_at: '2026-10-11T10:00:00Z',
});

function setup(ingest: jest.Mock = jest.fn(() => Promise.resolve('changed'))) {
  const ingestion = { ingest, handleRunEvent: jest.fn() };
  const worker = new IngestionWorker(ingestion as unknown as IngestionService);
  const redis = fakeRedis();
  Object.assign(worker, { redis, running: true });
  return { worker, redis, ingestion };
}

describe('IngestionWorker.step', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('прибирає повідомлення лише після запису в БД', async () => {
    const { worker, redis, ingestion } = setup();
    redis.lpush(SCRAPER_RESULTS_QUEUE, product);
    expect(await worker.step()).toBe(0);
    expect(ingestion.ingest).toHaveBeenCalledTimes(1);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([]);
  });

  it('збій БД: повідомлення лишається і повторюється з паузою', async () => {
    const ingest = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue('changed');
    const { worker, redis } = setup(ingest);
    redis.lpush(SCRAPER_RESULTS_QUEUE, product);

    expect(await worker.step()).toBeGreaterThan(0);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([product]);

    expect(await worker.step()).toBe(0);
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([]);
  });

  it('після падіння воркера спершу дообробляє незавершене повідомлення', async () => {
    const { worker, redis, ingestion } = setup();
    redis.lpush(SCRAPER_RESULTS_PROCESSING, product);
    redis.lpush(SCRAPER_RESULTS_QUEUE, 'next');
    await worker.step();
    expect(ingestion.ingest).toHaveBeenCalledTimes(1);
    expect(redis.lists.get(SCRAPER_RESULTS_QUEUE)).toEqual(['next']);
  });

  it('некоректне повідомлення — одразу в dead-letter', async () => {
    const { worker, redis, ingestion } = setup();
    redis.lpush(SCRAPER_RESULTS_QUEUE, '{"price":0}');
    await worker.step();
    expect(ingestion.ingest).not.toHaveBeenCalled();
    expect(redis.lists.get(SCRAPER_RESULTS_DEAD)).toEqual(['{"price":0}']);
  });

  it(`після ${MAX_ATTEMPTS} невдалих спроб — у dead-letter, черга йде далі`, async () => {
    const { worker, redis } = setup(
      jest.fn().mockRejectedValue(new Error('bug')),
    );
    redis.lpush(SCRAPER_RESULTS_QUEUE, product);
    for (let i = 0; i < MAX_ATTEMPTS; i++) await worker.step();
    expect(redis.lists.get(SCRAPER_RESULTS_DEAD)).toEqual([product]);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([]);
  });
});

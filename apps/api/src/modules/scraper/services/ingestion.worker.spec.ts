import { Logger } from '@nestjs/common';
import {
  SCRAPER_RESULTS_DEAD,
  SCRAPER_RESULTS_PROCESSING,
  SCRAPER_RESULTS_QUEUE,
} from '@repo/contracts';
import { IngestionService } from './ingestion.service';
import { BATCH_SIZE, IngestionWorker, MAX_ATTEMPTS } from './ingestion.worker';

/** Redis-списки в памʼяті: LPUSH додає зліва, RIGHT — найстаріший елемент */
function fakeRedis() {
  const lists = new Map<string, string[]>();
  const list = (key: string) => {
    if (!lists.has(key)) lists.set(key, []);
    return lists.get(key)!;
  };
  const redis = {
    lists,
    lrange: (key: string, start: number, stop: number) => {
      const items = list(key);
      return Promise.resolve(
        items.slice(Math.max(items.length + start, 0), items.length + stop + 1),
      );
    },
    lmove: (from: string, to: string) => {
      const value = list(from).pop() ?? null;
      if (value !== null) list(to).unshift(value);
      return Promise.resolve(value);
    },
    blmove: (from: string, to: string) => redis.lmove(from, to),
    pipeline() {
      const ops: (() => Promise<string | null>)[] = [];
      const pipe = {
        lmove: (from: string, to: string) => {
          ops.push(() => redis.lmove(from, to));
          return pipe;
        },
        exec: async () =>
          Promise.all(ops.map(async (op) => [null, await op()])),
      };
      return pipe;
    },
    lrem: (key: string, _count: number, value: string) => {
      const items = list(key);
      const i = items.lastIndexOf(value);
      if (i >= 0) items.splice(i, 1);
      return Promise.resolve(i >= 0 ? 1 : 0);
    },
    lpush: (key: string, value: string) => list(key).unshift(value),
    set: () => Promise.resolve('OK'),
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

const productOf = (external: string) =>
  JSON.stringify({
    kind: 'product',
    store: 'novus',
    external,
    name: 'Coca-Cola 0,5 л',
    price: 29.9,
    scraper_at: '2026-10-11T10:00:00Z',
  });
const product = productOf('1');
const eventRaw = JSON.stringify({
  kind: 'run_finished',
  run_id: 'run-1',
  store: 'novus',
  pages_fetched: 1,
  items_seen: 1,
  at: '2026-10-11T10:00:00Z',
});
/** Кладе повідомлення в чергу так, як це робить скрапер: перше — найстаріше */
function enqueue(redis: ReturnType<typeof fakeRedis>, ...raws: string[]) {
  for (const raw of raws) redis.lpush(SCRAPER_RESULTS_QUEUE, raw);
}

function setup(
  ingestBatch: jest.Mock = jest.fn(() => Promise.resolve([])),
  ingest: jest.Mock = jest.fn(() => Promise.resolve('changed')),
) {
  const ingestion = {
    ingestBatch,
    ingest,
    handleRunEvent: jest.fn(),
    countFailed: jest.fn(() => Promise.resolve()),
  };
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
    expect(ingestion.ingestBatch).toHaveBeenCalledTimes(1);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([]);
  });

  it('бере з черги пакет і передає його одним викликом у порядку черги', async () => {
    const { worker, redis, ingestion } = setup();
    enqueue(redis, productOf('1'), productOf('2'), productOf('3'));

    expect(await worker.step()).toBe(0);

    expect(ingestion.ingestBatch).toHaveBeenCalledTimes(1);
    const items = ingestion.ingestBatch.mock.calls[0][0] as {
      external: string;
    }[];
    expect(items.map((i) => i.external)).toEqual(['1', '2', '3']);
    expect(ingestion.ingest).not.toHaveBeenCalled();
    expect(redis.lists.get(SCRAPER_RESULTS_QUEUE)).toEqual([]);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([]);
  });

  it(`пакет не більший за ${BATCH_SIZE}: решта чекає в черзі`, async () => {
    const { worker, redis, ingestion } = setup();
    enqueue(
      redis,
      ...Array.from({ length: BATCH_SIZE + 5 }, (_, i) => productOf(String(i))),
    );
    await worker.step();
    expect(ingestion.ingestBatch.mock.calls[0][0]).toHaveLength(BATCH_SIZE);
    expect(redis.lists.get(SCRAPER_RESULTS_QUEUE)).toHaveLength(5);
    // Наступний пакет починається з наступного за порядком повідомлення
    await worker.step();
    const second = ingestion.ingestBatch.mock.calls[1][0] as {
      external: string;
    }[];
    expect(second.map((i) => i.external)).toEqual([
      String(BATCH_SIZE),
      String(BATCH_SIZE + 1),
      String(BATCH_SIZE + 2),
      String(BATCH_SIZE + 3),
      String(BATCH_SIZE + 4),
    ]);
  });

  it('збій БД: повідомлення лишається і повторюється з паузою', async () => {
    const { worker, redis, ingestion } = setup(
      jest.fn().mockRejectedValueOnce(new Error('db down')),
      jest.fn().mockRejectedValueOnce(new Error('db down')),
    );
    redis.lpush(SCRAPER_RESULTS_QUEUE, product);

    expect(await worker.step()).toBeGreaterThan(0);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([product]);

    expect(await worker.step()).toBe(0);
    expect(ingestion.ingestBatch).toHaveBeenCalledTimes(2);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([]);
  });

  it('після падіння воркера спершу дообробляє незавершене', async () => {
    const { worker, redis, ingestion } = setup();
    redis.lpush(SCRAPER_RESULTS_PROCESSING, productOf('1'));
    redis.lpush(SCRAPER_RESULTS_PROCESSING, productOf('2'));
    redis.lpush(SCRAPER_RESULTS_QUEUE, productOf('3'));
    await worker.step();
    const items = ingestion.ingestBatch.mock.calls[0][0] as {
      external: string;
    }[];
    // Найстаріше (справа) першим
    expect(items.map((i) => i.external)).toEqual(['1', '2']);
    expect(redis.lists.get(SCRAPER_RESULTS_QUEUE)).toEqual([productOf('3')]);
  });

  it('некоректне повідомлення — у dead-letter, решта пакета обробляється', async () => {
    const { worker, redis, ingestion } = setup();
    enqueue(redis, productOf('1'), '{"price":0}', productOf('2'));
    expect(await worker.step()).toBe(0);
    const items = ingestion.ingestBatch.mock.calls[0][0] as {
      external: string;
    }[];
    expect(items.map((i) => i.external)).toEqual(['1', '2']);
    expect(redis.lists.get(SCRAPER_RESULTS_DEAD)).toEqual(['{"price":0}']);
    expect(ingestion.countFailed).toHaveBeenCalledWith(null);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([]);
  });

  it('подія запуску розділяє пакет: товари до неї записані раніше', async () => {
    const { worker, redis, ingestion } = setup();
    const order: string[] = [];
    ingestion.ingestBatch.mockImplementation((items: unknown[]) => {
      order.push(`batch:${items.length}`);
      return Promise.resolve([]);
    });
    ingestion.handleRunEvent.mockImplementation(() => {
      order.push('event');
    });
    enqueue(redis, productOf('1'), productOf('2'), eventRaw, productOf('3'));
    await worker.step();
    expect(order).toEqual(['batch:2', 'event', 'batch:1']);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([]);
  });

  it('один товар, що не проходить, не губить решту: пакет розбирається по одному', async () => {
    const poison = productOf('poison');
    const ingest = jest.fn((item: { external: string }) =>
      item.external === 'poison'
        ? Promise.reject(new Error('bug'))
        : Promise.resolve('changed'),
    );
    const { worker, redis } = setup(
      jest.fn().mockRejectedValue(new Error('bug')),
      ingest,
    );
    enqueue(redis, productOf('1'), poison, productOf('2'));

    // Перший товар записано, на винному крок зупиняється з паузою
    expect(await worker.step()).toBeGreaterThan(0);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([
      productOf('2'),
      poison,
    ]);

    for (let i = 1; i < MAX_ATTEMPTS; i++) await worker.step();
    expect(redis.lists.get(SCRAPER_RESULTS_DEAD)).toEqual([poison]);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([
      productOf('2'),
    ]);

    // Решта пакета не загублена
    expect(await worker.step()).toBe(0);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([]);
  });

  it(`після ${MAX_ATTEMPTS} невдалих спроб — у dead-letter, черга йде далі`, async () => {
    const { worker, redis } = setup(
      jest.fn().mockRejectedValue(new Error('bug')),
      jest.fn().mockRejectedValue(new Error('bug')),
    );
    redis.lpush(SCRAPER_RESULTS_QUEUE, product);
    for (let i = 0; i < MAX_ATTEMPTS; i++) await worker.step();
    expect(redis.lists.get(SCRAPER_RESULTS_DEAD)).toEqual([product]);
    expect(redis.lists.get(SCRAPER_RESULTS_PROCESSING)).toEqual([]);
  });
});

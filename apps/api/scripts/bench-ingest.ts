/**
 * Пропускна здатність інжесту (PERF-05): повідомлень за секунду від черги Redis до БД.
 * Фікстури синтетичні, без обходів сайтів. Скрипт очищає таблиці, тож працює лише з
 * окремою базою, у назві якої є "bench", і з окремою базою Redis:
 *
 *   DATABASE_URL=postgresql://…/onnimart_bench REDIS_URL=redis://:<pw>@localhost:6379/14 \
 *     bun scripts/bench-ingest.ts [--count 5000] [--service ./path] [--worker ./path]
 *
 * --service / --worker — інші реалізації для порівняння (за замовчуванням поточні).
 */
import { Logger } from '@nestjs/common';
import {
  SCRAPER_RESULTS_PROCESSING,
  SCRAPER_RESULTS_QUEUE,
} from '@repo/contracts';
import { resolve } from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service';
import { createRedis } from '../src/redis';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const count = Number(arg('count', '5000'));
// Шляхи — від apps/api, звідки запускається скрипт
const dir = 'src/modules/scraper/services';
const servicePath = resolve(arg('service', `${dir}/ingestion.service`));
const workerPath = resolve(arg('worker', `${dir}/ingestion.worker`));

async function main() {
  if (!new URL(process.env.DATABASE_URL ?? 'x:').pathname.endsWith('_bench')) {
    throw new Error('DATABASE_URL має вказувати на базу з назвою …_bench');
  }
  if (!/\/(1[0-9]|[2-9])$/.test(process.env.REDIS_URL ?? '')) {
    throw new Error('REDIS_URL має вказувати на окрему базу Redis (…/14)');
  }
  Logger.overrideLogger(false);

  const { IngestionService } = (await import(servicePath)) as {
    IngestionService: new (...args: unknown[]) => {
      flushProgress(): Promise<void>;
    };
  };
  const { IngestionWorker } = (await import(workerPath)) as {
    IngestionWorker: new (service: unknown) => {
      step(): Promise<number>;
      onApplicationShutdown(): Promise<void>;
    };
  };

  const prisma = new PrismaService();
  await prisma.$connect();
  const redis = createRedis();
  await prisma.$executeRawUnsafe(
    `TRUNCATE price_snapshots, scrape_runs, listings, store_chains, countries RESTART IDENTITY CASCADE`,
  );
  await redis.del(SCRAPER_RESULTS_QUEUE, SCRAPER_RESULTS_PROCESSING);
  await prisma.country.create({
    data: { code: 'UA', name: 'Україна', currency: 'UAH' },
  });
  const chain = await prisma.storeChain.create({
    data: {
      slug: 'bench',
      name: 'Bench',
      website: 'https://bench.example',
      countryCode: 'UA',
      currency: 'UAH',
      status: 'ACTIVE',
      scrapeEnabled: true,
    },
  });

  const service = new IngestionService(prisma, { schedule: () => undefined });
  const worker = new IngestionWorker(service);
  Object.assign(worker, { running: true });

  /** change: частка карток, у яких змінилась ціна */
  function messages(change: number, runId: string) {
    return Array.from({ length: count }, (_, i) =>
      JSON.stringify({
        kind: 'product',
        store: 'bench',
        external: String(i),
        name: `Напій Coca-Cola Zero 0,5л №${i}`,
        brand: 'Coca-Cola',
        price: 25 + (i % 5) + (i < count * change ? 10 : 0),
        barcodes: i % 3 === 0 ? ['5449000132499'] : [],
        run_id: runId,
        scraper_at: '2026-11-07T10:00:00Z',
      }),
    );
  }

  async function phase(name: string, change: number) {
    const run = await prisma.scrapeRun.create({
      data: { chainId: chain.id, status: 'RUNNING' },
    });
    // LPUSH кладе зліва, воркер бере справа: першим іде найстаріше
    for (const part of chunks(messages(change, run.id), 1000)) {
      await redis.lpush(SCRAPER_RESULTS_QUEUE, ...part);
    }
    const started = performance.now();
    while (
      (await redis.llen(SCRAPER_RESULTS_QUEUE)) +
        (await redis.llen(SCRAPER_RESULTS_PROCESSING)) >
      0
    ) {
      await worker.step();
    }
    await service.flushProgress();
    const seconds = (performance.now() - started) / 1000;
    const after = await prisma.scrapeRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    console.log(
      `${name.padEnd(28)} ${(count / seconds).toFixed(0).padStart(6)} пов/с  ` +
        `(${seconds.toFixed(2)} с, itemsSeen=${after.itemsSeen}, itemsChanged=${after.itemsChanged})`,
    );
  }

  function* chunks<T>(list: T[], size: number) {
    for (let i = 0; i < list.length; i += size) yield list.slice(i, i + size);
  }

  console.log(`Фікстури: ${count} карток, 1/3 зі штрихкодом`);
  await phase('нові картки (усі змінені)', 0);
  await phase('повторний обхід (без змін)', 0);
  await phase('10% змінили ціну', 0.1);

  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
  SELECT count(*) AS n FROM price_snapshots`;
  console.log(`price_snapshots: ${n} (очікується ${count + count * 0.1})`);
  await worker.onApplicationShutdown();
  await redis.quit();
  await prisma.$disconnect();
}

void main();

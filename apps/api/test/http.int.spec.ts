// HTTP-тест справжнього AppModule: маршрути, токен адміністратора, валідація, CORS.
// Потрібні тестова база й окрема база Redis (тест очищає таблиці й пише в чергу):
//   TEST_DATABASE_URL=postgresql://…/onnimart_it TEST_REDIS_URL=redis://:<pw>@localhost:6379/15 bun run test:int
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MATCHING_REQUESTS_QUEUE } from '@repo/contracts';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { MatchingService } from '../src/modules/catalog/matching/matching.service';
import { IngestionService } from '../src/modules/scraper/services/ingestion.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createRedis } from '../src/redis';
import { setupApp } from '../src/setup';

const dbUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const TOKEN = 'e2e-token';
const ORIGIN = 'http://localhost:3000';

(dbUrl && redisUrl ? describe : describe.skip)('HTTP API', () => {
  let app: INestApplication;
  let base: string;
  let redis: Redis;

  const get = (path: string, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { headers });
  const post = (path: string, body?: unknown, token?: string) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeAll(async () => {
    // Захист від помилки: тест очищає всі таблиці
    if (!/_it|test/.test(dbUrl!)) {
      throw new Error(
        'TEST_DATABASE_URL має вказувати на тестову базу (_it / test)',
      );
    }
    Logger.overrideLogger(false);
    Object.assign(process.env, {
      DATABASE_URL: dbUrl,
      REDIS_URL: redisUrl,
      ADMIN_TOKEN: TOKEN,
      WEB_ORIGINS: ORIGIN,
    });

    // Дані: одна картка, зіставлена в каталог
    const prisma = new PrismaService();
    await prisma.$executeRawUnsafe(`
      TRUNCATE match_runs, match_keys, match_candidates, price_snapshots, scrape_runs,
        barcodes, listings, product_variants, products, product_lines, brands, stores,
        store_chains, countries, subscriptions, users RESTART IDENTITY CASCADE`);
    await prisma.country.create({
      data: { code: 'UA', name: 'Україна', currency: 'UAH' },
    });
    await prisma.storeChain.create({
      data: {
        slug: 'novus',
        name: 'NOVUS',
        website: 'https://novus.example',
        countryCode: 'UA',
        currency: 'UAH',
        status: 'ACTIVE',
        scrapeEnabled: true,
      },
    });
    const matching = new MatchingService(prisma);
    await new IngestionService(prisma, matching).ingest({
      kind: 'product',
      store: 'novus',
      external: 'cola',
      name: 'Напій Coca-Cola 0,5л',
      brand: 'Coca-Cola',
      barcodes: ['5449000000996'],
      price: 29.9,
      scraper_at: '2026-10-19T08:00:00Z',
      in_stock: true,
    });
    await matching.run();
    matching.onModuleDestroy();
    await prisma.$disconnect();

    redis = createRedis();
    await redis.del(MATCHING_REQUESTS_QUEUE);

    app = await NestFactory.create(AppModule, { logger: false });
    setupApp(app);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await redis?.del(MATCHING_REQUESTS_QUEUE);
    redis?.disconnect();
    await app?.close();
  });

  it('health: база й Redis доступні', async () => {
    const response = await get('/api/v1/health');
    // Воркер у тесті не запущено — degraded, але не down
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      database: true,
      redis: true,
      worker: false,
    });
  });

  it('каталог: пошук і картка товару', async () => {
    const page = await (await get('/api/v1/products?q=coca')).json();
    expect(page).toMatchObject({ total: 1, page: 1 });
    const id = page.items[0].id;

    const product = await get(`/api/v1/products/${id}`);
    expect(product.status).toBe(200);
    expect(await product.json()).toMatchObject({ id });
  });

  it('невідомий товар — 404 з повідомленням', async () => {
    const response = await get(
      '/api/v1/products/00000000-0000-4000-8000-000000000000',
    );
    expect(response.status).toBe(404);
    expect((await response.json()).message).toContain('не знайдено');
    for (const path of ['/api/v1/products/abc', '/api/v1/listings/abc']) {
      expect((await get(path)).status).toBe(404);
    }
  });

  it('некоректні параметри — 400, а не 500', async () => {
    expect((await get('/api/v1/products?pageSize=1000')).status).toBe(400);
    expect((await get('/api/v1/products?unknown=1')).status).toBe(400);
    expect(
      (await post('/api/v1/scraper/trigger', { store: 'NOVUS!' }, TOKEN))
        .status,
    ).toBe(400);
  });

  it('зміни — лише з токеном адміністратора', async () => {
    expect((await post('/api/v1/matching/run')).status).toBe(401);
    expect(
      (await post('/api/v1/matching/run', undefined, 'wrong')).status,
    ).toBe(401);
    expect((await post('/api/v1/matching/run', undefined, TOKEN)).status).toBe(
      202,
    );
    // API не зіставляє сам — лише ставить запит воркеру
    expect(await redis.llen(MATCHING_REQUESTS_QUEUE)).toBe(1);
  });

  it('CORS — лише для веб-адмінки', async () => {
    const allowed = await get('/api/v1/stats', { origin: ORIGIN });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const other = await get('/api/v1/stats', {
      origin: 'https://evil.example',
    });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});

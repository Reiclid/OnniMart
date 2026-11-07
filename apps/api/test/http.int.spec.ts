// HTTP-тест справжнього AppModule: маршрути, токен адміністратора, валідація, CORS.
// Потрібні тестова база й окрема база Redis (тест очищає таблиці й пише в чергу):
//   TEST_DATABASE_URL=postgresql://…/onnimart_it TEST_REDIS_URL=redis://:<pw>@localhost:6379/15 bun run test:int
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MATCHING_REQUESTS_QUEUE } from '@repo/contracts';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { AlertsChecker } from '../src/modules/accounts/alerts.checker';
import { PushService } from '../src/modules/push/push.service';
import { RatesService } from '../src/modules/rates/rates.service';
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
    // Пошук через SQL: індекс Meilisearch наповнений робочими, а не тестовими даними
    delete process.env.MEILI_URL;
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
      TRUNCATE events, product_views, sessions, notifications, match_runs, match_keys, match_candidates, price_snapshots, scrape_runs,
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
      scraper_at: new Date().toISOString(), // картка старша за 14 днів не дає сповіщень
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
  }, 30_000); // холодний старт Prisma + Nest довший за 5 с за замовчуванням

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

  it('зміни адмінки без токена — 401, до БД запит не доходить', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const routes = [
      ['PATCH', `/api/v1/products/${id}`],
      ['PATCH', `/api/v1/variants/${id}`],
      ['POST', `/api/v1/variants/${id}/barcodes`],
      ['DELETE', `/api/v1/variants/${id}/barcodes/4820000000000`],
      ['POST', `/api/v1/matching/candidates/${id}/accept`],
      ['POST', `/api/v1/matching/listings/${id}/reject`],
      ['POST', `/api/v1/matching/listings/${id}/unlink`],
      ['POST', `/api/v1/matching/decisions/${id}/undo`],
      ['POST', `/api/v1/matching/barcode-candidates/${id}/accept`],
      ['POST', `/api/v1/matching/variants/${id}/barcode-candidates/reject`],
      ['PUT', '/api/v1/matching/rules/barcode'],
      ['PUT', '/api/v1/variations/smak'],
      ['DELETE', '/api/v1/variations/smak'],
      ['PATCH', `/api/v1/brands/${id}`],
      ['POST', `/api/v1/brands/${id}/merge`],
      ['PUT', '/api/v1/scraper/schedule'],
      ['POST', '/api/v1/scraper/run-all'],
    ];
    for (const [method, path] of routes) {
      const response = await fetch(`${base}${path}`, { method });
      expect(`${method} ${path} ${response.status}`).toBe(
        `${method} ${path} 401`,
      );
    }
  });

  it('x-request-id: свій або згенерований — для звʼязування з логом', async () => {
    const own = await get('/api/v1/stats', { 'x-request-id': 'req-42' });
    expect(own.headers.get('x-request-id')).toBe('req-42');
    const generated = await get('/api/v1/stats', { 'x-request-id': 'a b' });
    expect(generated.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('акаунт: реєстрація → підписка на ціну → сповіщення → вихід', async () => {
    const credentials = {
      email: 'Olena@Example.com',
      password: 'correct horse',
    };
    const registered = await post('/api/v1/auth/register', {
      ...credentials,
      name: 'Olena',
    });
    expect(registered.status).toBe(201);
    expect((await post('/api/v1/auth/register', credentials)).status).toBe(409);
    expect(
      (
        await post('/api/v1/auth/register', {
          email: 'x@y.z',
          password: 'short',
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await post('/api/v1/auth/login', {
          ...credentials,
          password: 'wrong password',
        })
      ).status,
    ).toBe(401);
    const login = await post('/api/v1/auth/login', {
      email: 'olena@example.com',
      password: credentials.password,
    });
    expect(login.status).toBe(200);
    const { token } = (await login.json()) as { token: string };
    const auth = { authorization: `Bearer ${token}` };
    const send = (method: string, path: string, body?: unknown) =>
      fetch(`${base}${path}`, {
        method,
        headers: { ...auth, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    expect((await get('/api/v1/me')).status).toBe(401);
    const me = await (await get('/api/v1/me', auth)).json();
    expect(me).toMatchObject({
      email: 'olena@example.com',
      name: 'Olena',
      minDiscount: 0,
    });
    expect(
      await (await send('PATCH', '/api/v1/me', { minDiscount: 10 })).json(),
    ).toMatchObject({ minDiscount: 10 });

    const page = await (await get('/api/v1/products?q=coca')).json();
    const product = await (
      await get(`/api/v1/products/${page.items[0].id}`)
    ).json();
    const created = await send('POST', '/api/v1/me/subscriptions', {
      variantId: product.variants[0].id,
      targetPrice: 30,
    });
    expect(created.status).toBe(201);
    const subscription = await created.json();
    expect(subscription).toMatchObject({
      targetPrice: 30,
      isActive: true,
      lowest: { price: 29.9, chainName: 'NOVUS' },
    });

    // For you: з категорії підписки, але без самого підписаного товару
    const forYou = (await (
      await get('/api/v1/me/recommendations', auth)
    ).json()) as { id: string }[];
    expect(Array.isArray(forYou)).toBe(true);
    expect(forYou.map((p) => p.id)).not.toContain(product.id);

    // Воркер: ціна 29.90 ≤ 30 → сповіщення, повторна перевірка не дублює
    const prisma = new PrismaService();
    // Підписка без валюти — курси не потрібні
    const noRates = {
      current: () => Promise.resolve(null),
    } as unknown as RatesService;
    // Без VAPID-ключів push вимкнено — лише сповіщення в застосунку
    const checker = new AlertsChecker(prisma, noRates, new PushService(prisma));
    expect(await checker.check()).toBe(1);
    expect(await checker.check()).toBe(0);
    await prisma.$disconnect();
    const notifications = await (
      await get('/api/v1/me/notifications', auth)
    ).json();
    expect(notifications).toMatchObject([
      { type: 'TARGET_PRICE_REACHED', productId: product.id, readAt: null },
    ]);
    expect((await send('POST', '/api/v1/me/notifications/read')).status).toBe(
      204,
    );

    expect(
      (await send('DELETE', `/api/v1/me/subscriptions/${subscription.id}`))
        .status,
    ).toBe(204);
    expect(
      (await send('DELETE', `/api/v1/me/subscriptions/${subscription.id}`))
        .status,
    ).toBe(404);
    // PRD-04: перегляди — повтор піднімає товар нагору, невідомий id пропускається
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect(
      (
        await send('POST', '/api/v1/me/views', {
          productIds: [product.id, ghost, product.id],
        })
      ).status,
    ).toBe(204);
    const views = (await (await get('/api/v1/me/views', auth)).json()) as {
      id: string;
    }[];
    expect(views.map((p) => p.id)).toEqual([product.id]);
    const guestViews = (await (
      await get(`/api/v1/products/by-ids?ids=${ghost},${product.id}`)
    ).json()) as { id: string }[];
    expect(guestViews.map((p) => p.id)).toEqual([product.id]);
    expect((await send('DELETE', '/api/v1/me/views')).status).toBe(204);
    expect(await (await get('/api/v1/me/views', auth)).json()).toEqual([]);

    // Події: без згоди не пишуться, після згоди — так, відкликання стирає
    const batch = {
      sessionId: '11111111-1111-4111-8111-111111111111',
      events: [{ type: 'view', productId: product.id, listId: 'search' }],
    };
    const track = async () =>
      (
        (await (await send('POST', '/api/v1/me/events', batch)).json()) as {
          recorded: number;
        }
      ).recorded;
    expect(await track()).toBe(0);
    expect(
      await (
        await send('PATCH', '/api/v1/me', { telemetryConsent: true })
      ).json(),
    ).toMatchObject({ telemetryConsent: true });
    expect(await track()).toBe(1);
    expect(
      (
        await send('POST', '/api/v1/me/events', {
          ...batch,
          events: [{ type: 'teleport' }],
        })
      ).status,
    ).toBe(400);
    const counter = new PrismaService();
    expect(await counter.event.count()).toBe(1);

    // Ранжувальник v0: персональний пошук пише покази з позицією і сам запит
    const mine = await (
      await get('/api/v1/me/products?q=coca&pageSize=10', auth)
    ).json();
    expect(mine).toMatchObject({ total: 1, items: [{ id: product.id }] });
    for (let i = 0; i < 50 && (await counter.event.count()) < 3; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      await counter.event.findMany({
        where: { type: { in: ['IMPRESSION', 'SEARCH'] } },
        orderBy: { id: 'asc' },
        select: { type: true, productId: true, position: true, listId: true },
      }),
    ).toEqual([
      {
        type: 'IMPRESSION',
        productId: product.id,
        position: 0,
        listId: 'search',
      },
      { type: 'SEARCH', productId: null, position: null, listId: 'search' },
    ]);
    await send('PATCH', '/api/v1/me', { telemetryConsent: false });
    expect(await counter.event.count()).toBe(0);

    // Гість: лише з токеном адміністратора (серверна дія вебу) і явною згодою
    const anonId = '22222222-2222-4222-8222-222222222222';
    const guest = { ...batch, anonId, consent: true };
    expect((await post('/api/v1/events', guest)).status).toBe(401);
    expect(
      (await post('/api/v1/events', { ...guest, consent: false }, TOKEN))
        .status,
    ).toBe(400);
    expect(await (await post('/api/v1/events', guest, TOKEN)).json()).toEqual({
      recorded: 1,
    });
    const forget = await fetch(`${base}/api/v1/events/guests/${anonId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(forget.status).toBe(204);
    expect(await counter.event.count()).toBe(0);
    await counter.$disconnect();

    expect((await post('/api/v1/auth/logout', undefined, token)).status).toBe(
      204,
    );
    expect((await get('/api/v1/me', auth)).status).toBe(401);
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

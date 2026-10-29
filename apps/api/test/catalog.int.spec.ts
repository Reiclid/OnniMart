// Інтеграційний тест на справжній PostgreSQL: прийом даних → зіставлення → каталог.
// Потрібна окрема база з міграціями (TEST_DATABASE_URL), яку тест очищає:
//   TEST_DATABASE_URL=postgresql://…/onnimart_it bun run test:int
import { Logger } from '@nestjs/common';
import type { ScrapedProductMessage } from '@repo/contracts';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { MatchingClient } from '../src/modules/catalog/matching/matching.client';
import { MatchingService } from '../src/modules/catalog/matching/matching.service';
import { DecisionsService } from '../src/modules/catalog/matching/decisions.service';
import { ModerationService } from '../src/modules/catalog/matching/moderation.service';
import { IngestionService } from '../src/modules/scraper/services/ingestion.service';
import { PrismaService } from '../src/prisma/prisma.service';

const url = process.env.TEST_DATABASE_URL;
const COLA_EAN = '5449000000996';

(url ? describe : describe.skip)('каталог на PostgreSQL', () => {
  let prisma: PrismaService;
  let ingestion: IngestionService;
  let matching: MatchingService;
  let catalog: CatalogService;

  const product = (
    store: string,
    overrides: Partial<ScrapedProductMessage>,
  ): ScrapedProductMessage => ({
    kind: 'product',
    store,
    external: `${store}-${overrides.name}`,
    name: '',
    price: 10,
    scraper_at: '2026-10-19T08:00:00Z',
    in_stock: true,
    ...overrides,
  });

  beforeAll(async () => {
    // Захист від помилки: тест очищає всі таблиці
    if (!/_it|test/.test(url!)) {
      throw new Error(
        'TEST_DATABASE_URL має вказувати на тестову базу (_it / test)',
      );
    }
    // Пошук через SQL: індекс Meilisearch наповнений робочими, а не тестовими даними
    delete process.env.MEILI_URL;
    Logger.overrideLogger(false);
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    matching = new MatchingService(prisma);
    // Redis тут не потрібен: стан зіставлення й відбиток словника — у памʼяті
    Object.assign(matching, {
      redis: {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve('OK'),
        disconnect: () => undefined,
      },
    });
    ingestion = new IngestionService(prisma, {
      schedule: () => undefined,
    } as unknown as MatchingService);
    catalog = new CatalogService(prisma, {} as MatchingClient);

    await prisma.$executeRawUnsafe(`
      TRUNCATE match_runs, match_keys, match_candidates, price_snapshots, scrape_runs, barcodes,
        listings, product_variants, products, product_lines, brands, stores,
        store_chains, countries, subscriptions, users RESTART IDENTITY CASCADE`);
    await prisma.country.create({
      data: { code: 'UA', name: 'Україна', currency: 'UAH' },
    });
    for (const slug of ['novus', 'silpo']) {
      await prisma.storeChain.create({
        data: {
          slug,
          name: slug.toUpperCase(),
          website: `https://${slug}.example`,
          countryCode: 'UA',
          currency: 'UAH',
          status: 'ACTIVE',
          scrapeEnabled: true,
        },
      });
    }

    await ingestion.ingest(
      product('novus', {
        name: 'Напій Coca-Cola 0,5л',
        brand: 'Coca-Cola',
        barcodes: [COLA_EAN],
        price: 29.9,
      }),
    );
    await ingestion.ingest(
      product('silpo', {
        name: 'Напій газований Coca-Cola 0,5 л',
        brand: 'Coca-Cola',
        barcodes: [COLA_EAN],
        price: 31.5,
      }),
    );
    await ingestion.ingest(
      product('novus', {
        name: 'Вода мінеральна Моршинська негазована 1,5л',
        brand: 'Моршинська',
        price: 25,
      }),
    );
    await matching.run();
  }, 30_000); // холодний старт Prisma + Nest довший за 5 с за замовчуванням

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('той самий товар з двох мереж — один запис каталогу', async () => {
    const page = await catalog.getProducts({ multiChain: true });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      chainsCount: 2,
      listingsCount: 2,
      prices: [{ currency: 'UAH', min: 29.9, max: 31.5, minChain: 'NOVUS' }],
    });
  });

  it('немає в наявності — ціна не найнижча, пропозиція в кінці', async () => {
    const novus = await prisma.listing.findFirstOrThrow({
      where: { chain: { slug: 'novus' }, rawName: { contains: 'Coca-Cola' } },
    });
    await prisma.listing.update({
      where: { id: novus.id },
      data: { inStock: false },
    });
    try {
      const page = await catalog.getProducts({ multiChain: true });
      expect(page.items[0]).toMatchObject({
        chainsCount: 2,
        prices: [{ min: 31.5, max: 31.5, minChain: 'SILPO' }],
      });
      const detail = await catalog.getProduct(page.items[0].id);
      expect(
        detail.variants[0].offers.map((o) => [o.chainName, o.inStock]),
      ).toEqual([
        ['SILPO', true],
        ['NOVUS', false],
      ]);
    } finally {
      await prisma.listing.update({
        where: { id: novus.id },
        data: { inStock: true },
      });
    }
  });

  it('категорія товару — з категорій і назв карток', async () => {
    const categories = await catalog.getCategories();
    expect(categories.find((c) => c.slug === 'drinks')).toMatchObject({
      productsCount: 2,
    });
    expect((await catalog.getProducts({ category: 'drinks' })).total).toBe(2);
    expect((await catalog.getProducts({ category: 'alcohol' })).total).toBe(0);
  });

  it('пошук за назвою, штрихкодом і мережею', async () => {
    const byName = await catalog.getProducts({ q: 'моршин' });
    expect(byName.items.map((p) => p.name)).toEqual([
      'Вода мінеральна Моршинська негазована',
    ]);
    const byBarcode = await catalog.getProducts({ q: COLA_EAN });
    expect(byBarcode.items[0].chainsCount).toBe(2);
    const bySilpo = await catalog.getProducts({ chain: 'silpo' });
    expect(bySilpo.total).toBe(1);
  });

  it('повторний пакет нічого не дублює', async () => {
    const report = await matching.run();
    expect(report.processed).toBe(0);
    expect(await prisma.product.count()).toBe(2);
    // Кожен пакет — у журналі; після перезапуску воркера статус відновлюється з нього
    expect(await prisma.matchRun.count()).toBe(2);
    const restarted = new MatchingService(prisma);
    Object.assign(restarted, { redis: (matching as any).redis });
    await restarted.onModuleInit();
    expect((restarted as any).last).toMatchObject({ processed: 0 });
  });

  it('після повного обходу зникла картка пропадає з каталогу', async () => {
    const novus = await prisma.storeChain.findUniqueOrThrow({
      where: { slug: 'novus' },
    });
    const run = await prisma.scrapeRun.create({
      data: { chainId: novus.id, maxPages: null },
    });
    // Обхід побачив лише Coca-Cola — Моршинська з сайту зникла
    await ingestion.ingest(
      product('novus', {
        name: 'Напій Coca-Cola 0,5л',
        brand: 'Coca-Cola',
        barcodes: [COLA_EAN],
        price: 29.9,
        run_id: run.id,
      }),
    );
    await ingestion.handleRunEvent({
      kind: 'run_finished',
      run_id: run.id,
      store: 'novus',
      pages_fetched: 1,
      items_seen: 1,
      at: '2026-10-19T09:00:00Z',
    });
    await matching.run();

    expect((await catalog.getProducts({ q: 'моршин' })).total).toBe(0);
    expect((await catalog.getProducts({ multiChain: true })).total).toBe(1);
  });

  it('мережа перевиставила товар з новим ID — та сама позиція каталогу, не дублікат', async () => {
    const old = await prisma.listing.findFirstOrThrow({
      where: { rawName: { contains: 'Моршинська' }, delistedAt: { not: null } },
      select: { variantId: true },
    });
    await ingestion.ingest(
      product('novus', {
        name: 'Вода мінеральна Моршинська негазована 1,5л',
        external: 'novus-morshynska-relisted',
        brand: 'Моршинська',
        price: 24,
      }),
    );
    await matching.run();

    const relisted = await prisma.listing.findFirstOrThrow({
      where: { externalId: 'novus-morshynska-relisted' },
      select: { variantId: true },
    });
    expect(relisted.variantId).toBe(old.variantId);
    expect(
      await prisma.product.count({
        where: { name: { contains: 'Моршинська' } },
      }),
    ).toBe(1);
    // Наступний тест розраховує на одну картку Моршинської
    await prisma.listing.delete({
      where: {
        id: (
          await prisma.listing.findFirstOrThrow({
            where: { externalId: 'novus-morshynska-relisted' },
          })
        ).id,
      },
    });
  });

  it('скасування рішення модератора повертає картку в чергу з тими самими кандидатами', async () => {
    const client = {
      request: () => Promise.resolve(),
    } as unknown as MatchingClient;
    const moderation = new ModerationService(prisma, client);
    const decisions = new DecisionsService(prisma, client);
    const cola = await prisma.listing.findFirstOrThrow({
      where: { rawName: 'Напій Coca-Cola 0,5л' },
    });
    // Нова картка без штрихкоду, яку модератор вирішує вручну
    await ingestion.ingest(
      product('silpo', {
        name: 'Кола Coca-Cola пет 0,5л',
        brand: 'Coca-Cola',
        price: 30,
      }),
    );
    const fresh = await prisma.listing.findFirstOrThrow({
      where: { rawName: 'Кола Coca-Cola пет 0,5л' },
    });
    const candidate = await prisma.matchCandidate.create({
      data: { listingId: fresh.id, variantId: cola.variantId, score: 0.8 },
    });

    await moderation.acceptCandidate(candidate.id);
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: fresh.id } }))
        .variantId,
    ).toBe(cola.variantId);

    await decisions.undoMatch(candidate.id);
    const back = await prisma.listing.findUniqueOrThrow({
      where: { id: fresh.id },
    });
    expect(back).toMatchObject({ variantId: null, matchStatus: 'PENDING' });
    expect(
      await prisma.matchCandidate.findUniqueOrThrow({
        where: { id: candidate.id },
      }),
    ).toMatchObject({ status: 'SUGGESTED', decidedAt: null });
    // Картка в черзі — повторне скасування неможливе
    await expect(decisions.undoMatch(candidate.id)).rejects.toThrow();
    await prisma.listing.delete({ where: { id: fresh.id } });
  });

  it('відвʼязування не стирає рішення модератора й підписки', async () => {
    const moderation = new ModerationService(prisma, {
      request: () => Promise.resolve(),
    } as unknown as MatchingClient);
    const listing = (name: string) =>
      prisma.listing.findFirstOrThrow({ where: { rawName: name } });

    // Остання картка товару → товар зникає, а пара "відхилено" лишається
    const water = await listing('Вода мінеральна Моршинська негазована 1,5л');
    await moderation.unlink(water.id);
    const decision = await prisma.matchCandidate.findFirstOrThrow({
      where: { listingId: water.id },
    });
    expect(decision).toMatchObject({ status: 'REJECTED', variantId: null });
    expect(
      await prisma.product.count({
        where: { name: { contains: 'Моршинська' } },
      }),
    ).toBe(0);

    // На Coca-Cola підписались — товар лишається навіть без карток
    const cola = await listing('Напій Coca-Cola 0,5л');
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: cola.variantId! },
    });
    const user = await prisma.user.create({ data: { email: 'a@example.com' } });
    await prisma.subscription.create({
      data: { userId: user.id, productId: variant.productId },
    });
    await moderation.unlink(cola.id);
    await moderation.unlink(
      (await listing('Напій газований Coca-Cola 0,5 л')).id,
    );
    expect(
      await prisma.product.count({ where: { id: variant.productId } }),
    ).toBe(1);
    expect(await prisma.subscription.count()).toBe(1);
  });
});

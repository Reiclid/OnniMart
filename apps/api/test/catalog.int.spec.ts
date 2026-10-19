// Інтеграційний тест на справжній PostgreSQL: прийом даних → зіставлення → каталог.
// Потрібна окрема база з міграціями (TEST_DATABASE_URL), яку тест очищає:
//   TEST_DATABASE_URL=postgresql://…/onnimart_it bun run test:int
import { Logger } from '@nestjs/common';
import type { ScrapedProductMessage } from '@repo/contracts';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { MatchingClient } from '../src/modules/catalog/matching/matching.client';
import { MatchingService } from '../src/modules/catalog/matching/matching.service';
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
      TRUNCATE match_keys, match_candidates, price_snapshots, scrape_runs, barcodes,
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
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('той самий товар з двох мереж — один запис каталогу', async () => {
    const page = await catalog.getProducts({ multiChain: true });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      chainsCount: 2,
      listingsCount: 2,
      prices: [{ currency: 'UAH', min: 29.9, max: 31.5 }],
    });
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

/**
 * Синтетичний каталог для бюджетів продуктивності (PRD-22): тисячі товарів, мережі двох країн,
 * історія цін і пошуковий індекс — щоб p95 API мав сенс. Усе вигадане й детерміноване:
 * фіксований seed (--seed, 22), повторний запуск дає той самий набір (ідентифікатори, назви,
 * ціни); реальних даних мереж тут немає, а штрихкоди — з діапазону «внутрішнього вжитку» (префікс 2).
 *
 * Також створює покупця з сесією (токен у PERF_SESSION, типово perf-session-token): /alerts і
 * /profile без входу ведуть на /login. Скрипт очищає таблиці каталогу, тож працює лише з базою, у назві якої є "_perf".
 * Спершу `prisma db seed` (країни, мережі, категорії), потім:
 *
 *   DATABASE_URL=postgresql://…/onnimart_perf MEILI_URL=… bun scripts/seed-perf.ts [--products 6000]
 */
import 'dotenv/config';
import { SearchIndexer } from '../src/modules/catalog/search/search.indexer';
import {
  meili,
  PRODUCTS_INDEX,
  searchEnabled,
} from '../src/modules/catalog/search/search';
import { sessionTokenHash } from '../src/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';
import type { Prisma } from '../src/generated/prisma/client';

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const PRODUCTS = arg('products', 6000);
const SEED = arg('seed', 22);
const HISTORY_DAYS = 90;
const DAY = 86_400_000;

/** mulberry32: детермінований генератор, щоб заміри між запусками порівнювалися на тих самих даних */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(SEED);
const int = (min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)];

/** Детермінований UUID: тип сутності + номер */
const uuid = (kind: number, n: number) =>
  `00000000-0000-4${kind.toString(16).padStart(3, '0')}-8000-${n.toString(16).padStart(12, '0')}`;

/** GTIN-13 з префіксом 2 (внутрішній вжиток) і правильною контрольною цифрою */
function gtin(n: number): string {
  const digits = `2${String(n).padStart(11, '0')}`;
  const sum = [...digits].reduce(
    (s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3),
    0,
  );
  return `0${digits}${(10 - (sum % 10)) % 10}`;
}

// Слова для назв: вигадані бренди й загальні типи товарів (мови мереж: de, uk, en)
const BRAND_PARTS = [
  [
    'Alp',
    'Nor',
    'Zor',
    'Vel',
    'Kar',
    'Lun',
    'Mer',
    'Tal',
    'Ost',
    'Fri',
    'Bel',
    'Sol',
  ],
  [
    'feld',
    'vik',
    'ya',
    'mont',
    'dal',
    'wald',
    'ora',
    'berg',
    'tal',
    'vita',
    'mark',
    'hof',
  ],
];
const TYPES: Record<
  string,
  { names: string[]; flavours: string[]; unit: 'g' | 'ml' | 'pcs' }
> = {
  'dairy-eggs': {
    names: [
      'Vollmilch',
      'Frische Milch',
      'Milch 1,5%',
      'Joghurt natur',
      'Butter',
      'Quark',
      'Gouda',
      'Молоко',
      'Кефір',
      'Сир кисломолочний',
    ],
    flavours: ['', 'Bio', 'Light', 'Класичне', 'Лактозфрі'],
    unit: 'g',
  },
  meat: {
    names: [
      'Hähnchenbrust',
      'Salami',
      'Schinken',
      'Bratwurst',
      'Сосиски',
      'Ковбаса варена',
    ],
    flavours: ['', 'Premium', 'Grill', 'Класична'],
    unit: 'g',
  },
  'fruit-veg': {
    names: ['Äpfel', 'Bananen', 'Tomaten', 'Gurken', 'Яблука', 'Картопля'],
    flavours: ['', 'Bio', 'Мита', 'Сорт 1'],
    unit: 'g',
  },
  bakery: {
    names: ['Vollkornbrot', 'Brötchen', 'Croissant', 'Хліб', 'Батон'],
    flavours: ['', 'Mehrkorn', 'Бездріжджовий'],
    unit: 'g',
  },
  pantry: {
    names: [
      'Nudeln',
      'Reis',
      'Haferflocken',
      'Olivenöl',
      'Ketchup',
      'Макарони',
      'Гречка',
      'Олія соняшникова',
    ],
    flavours: ['', 'Bio', 'Extra', 'Преміум'],
    unit: 'g',
  },
  'sweets-snacks': {
    names: [
      'Schokolade',
      'Kekse',
      'Chips',
      'Gummibärchen',
      'Печиво',
      'Цукерки',
    ],
    flavours: ['Milch', 'Zartbitter', 'Nuss', 'Карамель', 'Original'],
    unit: 'g',
  },
  drinks: {
    names: [
      'Mineralwasser',
      'Apfelsaft',
      'Limonade',
      'Cola',
      'Вода мінеральна',
      'Сік яблучний',
    ],
    flavours: ['', 'Zero', 'Zitrone', 'Класичний'],
    unit: 'ml',
  },
  'coffee-tea': {
    names: [
      'Kaffee gemahlen',
      'Schwarzer Tee',
      'Kaffeebohnen',
      'Чай чорний',
      'Кава мелена',
    ],
    flavours: ['', 'Mild', 'Kräftig', 'Класична'],
    unit: 'g',
  },
  frozen: {
    names: ['Pizza', 'Gemüsemischung', 'Fischstäbchen', 'Пельмені', 'Морозиво'],
    flavours: ['', 'Margherita', 'Класичні'],
    unit: 'g',
  },
  household: {
    names: ['Spülmittel', 'Waschmittel', 'Toilettenpapier', 'Серветки'],
    flavours: ['', 'Zitrone', 'Sensitive'],
    unit: 'pcs',
  },
};
const SIZES = {
  g: [100, 150, 200, 250, 400, 500, 750, 1000],
  ml: [250, 330, 500, 750, 1000, 1500],
  pcs: [1, 2, 4, 6, 10, 12],
};
const MEASURE = { g: 'MASS', ml: 'VOLUME', pcs: 'COUNT' } as const;
const sizeLabel = (unit: 'g' | 'ml' | 'pcs', value: number) =>
  unit === 'pcs'
    ? `${value} шт`
    : unit === 'g'
      ? value >= 1000
        ? `${value / 1000} кг`
        : `${value} г`
      : value >= 1000
        ? `${value / 1000} л`
        : `${value} мл`;

const BATCH = 5000;
async function insert<T>(rows: T[], write: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH)
    await write(rows.slice(i, i + BATCH));
}

async function main() {
  if (!new URL(process.env.DATABASE_URL ?? 'x:').pathname.endsWith('_perf')) {
    throw new Error('DATABASE_URL має вказувати на базу з назвою …_perf');
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const chains = await prisma.storeChain.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, countryCode: true, currency: true },
      orderBy: { slug: 'asc' },
    });
    const categories = await prisma.category.findMany({
      select: { id: true, slug: true },
    });
    const categoryId = new Map(categories.map((c) => [c.slug, c.id]));
    const byCountry = (code: string) =>
      chains.filter((c) => c.countryCode === code);
    if (
      !byCountry('UA').length ||
      !byCountry('DE').length ||
      !categories.length
    )
      throw new Error(
        'Спершу bun x prisma db seed: потрібні мережі UA і DE та категорії',
      );

    await prisma.$executeRawUnsafe(
      `TRUNCATE price_snapshots, listings, barcodes, product_variants, products, product_lines, brands, users RESTART IDENTITY CASCADE`,
    );

    const now = Date.now();
    const brands = Array.from({ length: 160 }, (_, i) => {
      const name = `${pick(BRAND_PARTS[0])}${pick(BRAND_PARTS[1])}`;
      return {
        id: uuid(1, i + 1),
        name,
        slug: `perf-${i + 1}-${name.toLowerCase()}`,
      };
    });
    await prisma.brand.createMany({ data: brands });

    const lines: Prisma.ProductLineCreateManyInput[] = [];
    const products: Prisma.ProductCreateManyInput[] = [];
    const variants: Prisma.ProductVariantCreateManyInput[] = [];
    const barcodes: Prisma.BarcodeCreateManyInput[] = [];
    const listings: Prisma.ListingCreateManyInput[] = [];
    const snapshots: Prisma.PriceSnapshotCreateManyInput[] = [];
    const typeSlugs = Object.keys(TYPES).filter((slug) => categoryId.has(slug));
    let variantN = 0;
    let listingN = 0;

    for (let i = 1; i <= PRODUCTS; i++) {
      const slug = pick(typeSlugs);
      const type = TYPES[slug];
      const brand = pick(brands);
      const typeName = pick(type.names);
      const flavour = pick(type.flavours);
      const name = [brand.name, typeName, flavour].filter(Boolean).join(' ');
      const lineId = uuid(2, i);
      lines.push({
        id: lineId,
        name: `${brand.name} ${typeName}`,
        slug: `perf-line-${i}`,
        brandId: brand.id,
      });
      products.push({
        id: uuid(3, i),
        name,
        slug: `perf-${i}`,
        variantLabel: flavour || null,
        lineId,
        brandId: brand.id,
        categoryId: categoryId.get(slug),
      });

      // 1–3 фасування; частка товарів — лише в Німеччині, 10% — в обох країнах
      const countries =
        random() < 0.1 ? ['UA', 'DE'] : [random() < 0.7 ? 'UA' : 'DE'];
      const sizes = [
        ...new Set(
          Array.from({ length: int(1, 3) }, () => pick(SIZES[type.unit])),
        ),
      ];
      for (const size of sizes) {
        variantN++;
        const variantId = uuid(4, variantN);
        const label = sizeLabel(type.unit, size);
        variants.push({
          id: variantId,
          productId: uuid(3, i),
          measure: MEASURE[type.unit],
          netQuantity: size,
          label,
          imageUrl: null,
        });
        const code = gtin(variantN);
        barcodes.push({ gtin: code, variantId, source: 'perf-seed' });

        for (const country of countries) {
          const pool = byCountry(country);
          const eur = country === 'DE';
          const base = (eur ? 0.5 : 15) + random() * (eur ? 6 : 220);
          for (const chain of [...pool]
            .sort(() => random() - 0.5)
            .slice(0, int(1, Math.min(4, pool.length)))) {
            listingN++;
            const listingId = uuid(5, listingN);
            // Ціна: шлях з історією; зміна ~ раз на 2 тижні, акція у ~15% карток
            let price = Math.round(base * (0.9 + random() * 0.25) * 100) / 100;
            const firstSeenAt = new Date(now - int(30, HISTORY_DAYS) * DAY);
            let at = firstSeenAt.getTime();
            let regular: number | null = null;
            let onPromo = false;
            let last = 0;
            for (; at <= now; at += int(7, 21) * DAY) {
              onPromo = random() < 0.15;
              regular = onPromo ? price : null;
              const paid = onPromo
                ? Math.round(price * 0.8 * 100) / 100
                : (price =
                    Math.round(price * (0.95 + random() * 0.12) * 100) / 100);
              last = paid;
              snapshots.push({
                listingId,
                price: paid,
                regularPrice: regular,
                unitPrice:
                  Math.round(
                    (paid / size) * (type.unit === 'pcs' ? 1 : 1000) * 100,
                  ) / 100,
                promoType: onPromo ? 'DISCOUNT' : null,
                promoLabel: onPromo ? '-20%' : null,
                capturedAt: new Date(at),
              });
            }
            listings.push({
              id: listingId,
              chainId: chain.id,
              externalId: `perf-${listingN}`,
              rawName: `${name} ${label}`,
              rawBrand: brand.name,
              barcodes: [code],
              nameTokens: [],
              measure: MEASURE[type.unit],
              netQuantity: size,
              packCount: 1,
              variantId,
              matchStatus: 'AUTO_MATCHED',
              matchMethod: 'BARCODE',
              matchScore: 1,
              matchedAt: new Date(now),
              currentPrice: last,
              regularPrice: onPromo ? regular : null,
              unitPrice:
                Math.round(
                  (last / size) * (type.unit === 'pcs' ? 1 : 1000) * 100,
                ) / 100,
              isOnPromo: onPromo,
              inStock: true,
              firstSeenAt,
              lastSeenAt: new Date(now - int(0, 2) * DAY),
            });
          }
        }
      }
    }

    await prisma.productLine.createMany({ data: lines });
    await insert(products, (data) => prisma.product.createMany({ data }));
    await insert(variants, (data) =>
      prisma.productVariant.createMany({ data }),
    );
    await insert(barcodes, (data) => prisma.barcode.createMany({ data }));
    await insert(listings, (data) => prisma.listing.createMany({ data }));
    await insert(snapshots, (data) =>
      prisma.priceSnapshot.createMany({ data }),
    );
    // Покупець для сторінок за входом: підписки, сповіщення й улюблені — щоб вони не були порожніми
    const user = await prisma.user.create({
      data: {
        email: 'perf@perf.example',
        name: 'Perf',
        locale: 'en',
        countryCode: 'UA',
      },
    });
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sessionTokenHash(
          process.env.PERF_SESSION ?? 'perf-session-token',
        ),
        expiresAt: new Date(now + 365 * DAY),
      },
    });
    const sample = Array.from({ length: 30 }, (_, i) => uuid(3, 1 + i * 150));
    await prisma.subscription.createMany({
      data: sample.map((productId, i) => ({
        userId: user.id,
        productId,
        targetPrice: 50 + i,
        currency: 'UAH',
      })),
    });
    await prisma.favourite.createMany({
      data: sample
        .slice(0, 20)
        .map((productId) => ({ userId: user.id, productId })),
    });
    await prisma.notification.createMany({
      data: sample.slice(0, 15).map((productId, i) => ({
        userId: user.id,
        type: 'PRICE_DROP' as const,
        channel: 'IN_APP' as const,
        title: 'Price drop',
        body: 'Perf seed',
        payload: { productId },
        dedupeKey: `perf:${i}`,
        createdAt: new Date(now - i * 3_600_000),
      })),
    });
    await prisma.$executeRaw`REFRESH MATERIALIZED VIEW product_stats`;
    await prisma.$executeRawUnsafe('ANALYZE');

    let indexed = 0;
    if (searchEnabled()) {
      indexed = await new SearchIndexer(prisma).reindex();
      // Індексація в Meilisearch асинхронна: чекаємо, поки черга завдань спорожніє
      for (let i = 0; i < 120; i++) {
        const { results } = await meili<{ results: unknown[] }>(
          '/tasks?statuses=enqueued,processing&limit=1',
        );
        if (!results.length) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      const stats = await meili<{ numberOfDocuments: number }>(
        `/indexes/${PRODUCTS_INDEX}/stats`,
      );
      if (stats.numberOfDocuments !== indexed)
        throw new Error(
          `В індексі ${stats.numberOfDocuments} з ${indexed} товарів`,
        );
    }
    console.log(
      `Синтетичний каталог: ${products.length} товарів, ${variants.length} фасувань, ${listings.length} карток, ${snapshots.length} цін, в індексі ${indexed}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();

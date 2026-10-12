// Початкові дані: країни, мережі (за результатами аудиту robots.txt — docs/01-data-sources.md),
// базові категорії та демо-лінійка Coca-Cola для перевірки ієрархії каталогу.
// Запуск: bun run dev:seed (з кореня репозиторію)
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ROBOTS_CHECKED_AT = new Date('2026-10-11T00:00:00Z');

type ChainSeed = {
  slug: string;
  name: string;
  website: string;
  countryCode: 'UA' | 'DE';
  /** Чи є готовий парсер у apps/scraper */
  scrapeEnabled?: boolean;
  crawlDelayMs?: number;
};

const CHAINS: ChainSeed[] = [
  // Україна
  {
    slug: 'silpo',
    name: 'Сільпо',
    website: 'https://silpo.ua',
    countryCode: 'UA',
    scrapeEnabled: true,
  },
  {
    slug: 'novus',
    name: 'NOVUS',
    website: 'https://novus.zakaz.ua',
    countryCode: 'UA',
    scrapeEnabled: true,
  },
  {
    slug: 'auchan',
    name: 'Ашан',
    website: 'https://auchan.zakaz.ua',
    countryCode: 'UA',
    scrapeEnabled: true,
  },
  {
    slug: 'metro-ua',
    name: 'METRO',
    website: 'https://metro.zakaz.ua',
    countryCode: 'UA',
    scrapeEnabled: true,
  },
  {
    slug: 'eko',
    name: 'ЕКО маркет',
    website: 'https://eko.zakaz.ua',
    countryCode: 'UA',
    scrapeEnabled: true,
  },
  {
    slug: 'megamarket',
    name: 'МегаМаркет',
    website: 'https://megamarket.zakaz.ua',
    countryCode: 'UA',
    scrapeEnabled: true,
  },
  {
    slug: 'varus',
    name: 'VARUS',
    website: 'https://varus.ua',
    countryCode: 'UA',
    scrapeEnabled: true,
  },
  // Парсер є, але сайт на технічних роботах (жовтень 2026)
  {
    slug: 'atb',
    name: 'АТБ',
    website: 'https://www.atbmarket.com',
    countryCode: 'UA',
  },
  // Німеччина
  {
    slug: 'aldi-sued',
    name: 'ALDI SÜD',
    website: 'https://www.aldi-sued.de',
    countryCode: 'DE',
    scrapeEnabled: true,
  },
  {
    slug: 'aldi-nord',
    name: 'ALDI Nord',
    website: 'https://www.aldi-nord.de',
    countryCode: 'DE',
    scrapeEnabled: true,
  },
  {
    slug: 'globus-de',
    name: 'Globus',
    website: 'https://produkte.globus.de',
    countryCode: 'DE',
    scrapeEnabled: true,
  },
  // Lidl не публікує ціни на продукти онлайн — беремо їх з Open Prices (prices.openfoodfacts.org)
  {
    slug: 'lidl-de',
    name: 'Lidl',
    website: 'https://www.lidl.de',
    countryCode: 'DE',
    scrapeEnabled: true,
  },
  // Kaufland, PENNY, NORMA публікують лише щотижневі акції, повного асортименту з цінами немає
  {
    slug: 'kaufland-de',
    name: 'Kaufland',
    website: 'https://filiale.kaufland.de',
    countryCode: 'DE',
    scrapeEnabled: true,
  },
  {
    slug: 'penny-de',
    name: 'PENNY',
    website: 'https://www.penny.de',
    countryCode: 'DE',
    scrapeEnabled: true,
  },
  {
    slug: 'norma-de',
    name: 'NORMA',
    website: 'https://www.norma-online.de',
    countryCode: 'DE',
    scrapeEnabled: true,
  },
];

const CATEGORIES: { slug: string; name: string; parent?: string }[] = [
  { slug: 'drinks', name: 'Напої' },
  { slug: 'soft-drinks', name: 'Солодка вода', parent: 'drinks' },
  { slug: 'water', name: 'Вода', parent: 'drinks' },
  { slug: 'juices', name: 'Соки та нектари', parent: 'drinks' },
  { slug: 'dairy', name: 'Молочні продукти та яйця' },
  { slug: 'grocery', name: 'Бакалія' },
  { slug: 'meat-fish', name: "М'ясо та риба" },
  { slug: 'fruits-vegetables', name: 'Овочі та фрукти' },
  { slug: 'bakery', name: 'Хліб та випічка' },
  { slug: 'sweets-snacks', name: 'Солодощі та снеки' },
  { slug: 'frozen', name: 'Заморожені продукти' },
  { slug: 'household', name: 'Побутова хімія' },
  { slug: 'personal-care', name: 'Гігієна та догляд' },
];

async function seedCountries() {
  await prisma.country.upsert({
    where: { code: 'UA' },
    create: { code: 'UA', name: 'Україна', currency: 'UAH' },
    update: {},
  });
  await prisma.country.upsert({
    where: { code: 'DE' },
    create: { code: 'DE', name: 'Німеччина', currency: 'EUR' },
    update: {},
  });
}

async function seedChains() {
  for (const chain of CHAINS) {
    const data = {
      name: chain.name,
      website: chain.website,
      countryCode: chain.countryCode,
      currency:
        chain.countryCode === 'UA' ? ('UAH' as const) : ('EUR' as const),
      scrapeEnabled: chain.scrapeEnabled ?? false,
      crawlDelayMs: chain.crawlDelayMs ?? 3000,
      robotsCheckedAt: ROBOTS_CHECKED_AT,
    };
    await prisma.storeChain.upsert({
      where: { slug: chain.slug },
      create: { slug: chain.slug, ...data },
      update: data,
    });
  }
}

async function seedCategories() {
  for (const category of CATEGORIES) {
    const parent = category.parent
      ? await prisma.category.findUniqueOrThrow({
          where: { slug: category.parent },
        })
      : null;
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: {
        slug: category.slug,
        name: category.name,
        parentId: parent?.id,
      },
      update: { name: category.name, parentId: parent?.id ?? null },
    });
  }
}

/** Демонстрація трирівневої ієрархії: лінійка → смак → фасування */
async function seedDemoCatalog() {
  const brand = await prisma.brand.upsert({
    where: { slug: 'coca-cola' },
    create: {
      slug: 'coca-cola',
      name: 'Coca-Cola',
      manufacturer: 'The Coca-Cola Company',
    },
    update: {},
  });
  const line = await prisma.productLine.upsert({
    where: { slug: 'coca-cola' },
    create: { slug: 'coca-cola', name: 'Coca-Cola', brandId: brand.id },
    update: {},
  });
  const category = await prisma.category.findUniqueOrThrow({
    where: { slug: 'soft-drinks' },
  });

  const flavours = [
    {
      slug: 'coca-cola-original',
      name: 'Coca-Cola Original',
      variantLabel: 'Original',
    },
    { slug: 'coca-cola-zero', name: 'Coca-Cola Zero', variantLabel: 'Zero' },
    {
      slug: 'coca-cola-cherry',
      name: 'Coca-Cola Cherry',
      variantLabel: 'Cherry',
    },
  ];
  const sizes = [
    { netQuantity: 330, label: '0,33 л', packaging: 'з/б' },
    { netQuantity: 500, label: '0,5 л', packaging: 'ПЕТ' },
    { netQuantity: 1000, label: '1 л', packaging: 'ПЕТ' },
    { netQuantity: 2000, label: '2 л', packaging: 'ПЕТ' },
  ];

  for (const flavour of flavours) {
    const product = await prisma.product.upsert({
      where: { slug: flavour.slug },
      create: {
        ...flavour,
        lineId: line.id,
        brandId: brand.id,
        categoryId: category.id,
      },
      update: {},
    });

    for (const size of sizes) {
      await prisma.productVariant.upsert({
        where: {
          productId_measure_netQuantity_packCount: {
            productId: product.id,
            measure: 'VOLUME',
            netQuantity: size.netQuantity,
            packCount: 1,
          },
        },
        create: { productId: product.id, measure: 'VOLUME', ...size },
        update: {},
      });
    }
  }
}

async function main() {
  await seedCountries();
  await seedChains();
  await seedCategories();
  await seedDemoCatalog();
  console.log(
    `Seed завершено: ${CHAINS.length} мереж, ${CATEGORIES.length} категорій`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

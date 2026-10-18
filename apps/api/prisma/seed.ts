// Початкові дані: країни, реєстр мереж (prisma/data/chains.ts: робочі парсери й кандидати
// з docs/04-retail-chains.md), базові категорії. Каталог товарів наповнює зіставлення (src/modules/catalog/matching).
// Запуск: bun run dev:seed (з кореня репозиторію)
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { CHAINS } from './data/chains';
import { COUNTRIES } from './data/countries';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ROBOTS_CHECKED_AT = new Date('2026-10-11T00:00:00Z');

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
  for (const country of COUNTRIES) {
    await prisma.country.upsert({
      where: { code: country.code },
      create: country,
      update: { name: country.name, currency: country.currency },
    });
  }
}

async function seedChains() {
  const currency = new Map(COUNTRIES.map((c) => [c.code, c.currency]));
  for (const chain of CHAINS) {
    const data = {
      name: chain.name,
      website: chain.website,
      countryCode: chain.countryCode,
      currency: currency.get(chain.countryCode)!,
      status: chain.status,
      onlinePrices: chain.onlinePrices,
      notes: chain.notes ?? null,
      // Обходимо лише мережі з робочим парсером
      scrapeEnabled: chain.status === 'ACTIVE',
      crawlDelayMs: chain.crawlDelayMs ?? 3000,
      robotsCheckedAt:
        chain.status === 'ACTIVE' || chain.status === 'PAUSED'
          ? ROBOTS_CHECKED_AT
          : null,
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

async function main() {
  await seedCountries();
  await seedChains();
  await seedCategories();
  console.log(
    `Seed завершено: ${COUNTRIES.length} країн, ${CHAINS.length} мереж, ${CATEGORIES.length} категорій`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

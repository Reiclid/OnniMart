// Початкові дані: країни, реєстр мереж (prisma/data/chains.ts: робочі парсери й кандидати
// з docs/04-retail-chains.md), базові категорії. Каталог товарів наповнює зіставлення (src/modules/catalog/matching).
// Запуск: bun run dev:seed (з кореня репозиторію)
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { CHAINS } from './data/chains';
import { COUNTRIES } from './data/countries';
import { CATEGORIES } from '@repo/matching';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ROBOTS_CHECKED_AT = new Date('2026-10-11T00:00:00Z');

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
      scrapeHourUtc: chain.scrapeHourUtc ?? null,
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

/** Єдиний довідник категорій — той самий, за яким воркер класифікує товари (@repo/matching) */
async function seedCategories() {
  for (const { slug, name } of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug },
      create: { slug, name },
      update: { name, parentId: null },
    });
  }
  // Категорії з давніх версій довідника, до яких не привʼязано жодного товару
  await prisma.category.deleteMany({
    where: {
      slug: { notIn: CATEGORIES.map((c) => c.slug) },
      products: { none: {} },
    },
  });
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

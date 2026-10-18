// Повторно розбирає фасування і ціну за одиницю для всіх карток із збережених
// сирих даних парсера (Listing.rawData) — без повторного скрейпінгу.
// Потрібно після змін у packages/matching/src/normalization/quantity.ts.
//
// Запуск: bun scripts/reparse-listings.ts
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { computeUnitPrice } from '@repo/matching';
import type { ScrapedProductMessage } from '@repo/contracts';
import { resolveQuantity } from '../src/modules/scraper/services/ingestion.service';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const listings = await prisma.listing.findMany({
    select: {
      id: true,
      rawData: true,
      measure: true,
      netQuantity: true,
      packCount: true,
      isWeighted: true,
      currentPrice: true,
      unitPrice: true,
    },
  });

  let changed = 0;
  for (const listing of listings) {
    if (!listing.rawData || listing.currentPrice === null) continue;
    const quantity = resolveQuantity(
      listing.rawData as unknown as ScrapedProductMessage,
    );
    const unitPrice = computeUnitPrice(Number(listing.currentPrice), quantity);
    const same =
      (quantity?.measure ?? null) === listing.measure &&
      (quantity?.netQuantity ?? null) ===
        (listing.netQuantity === null ? null : Number(listing.netQuantity)) &&
      (quantity?.packCount ?? null) === listing.packCount &&
      (quantity?.isWeighted ?? false) === listing.isWeighted &&
      unitPrice ===
        (listing.unitPrice === null ? null : Number(listing.unitPrice));
    if (same) continue;

    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        measure: quantity?.measure ?? null,
        netQuantity: quantity?.netQuantity ?? null,
        packCount: quantity?.packCount ?? null,
        isWeighted: quantity?.isWeighted ?? false,
        unitPrice,
      },
    });
    changed++;
  }
  console.log(`Перевірено карток: ${listings.length}, оновлено: ${changed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

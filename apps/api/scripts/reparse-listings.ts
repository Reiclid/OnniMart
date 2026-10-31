// Повторно розбирає фасування і ціну за одиницю для всіх карток із збережених
// сирих даних парсера (Listing.rawData) — без повторного скрейпінгу.
// Потрібно після змін у packages/matching/src/normalization/quantity.ts.
//
// Запуск: bun scripts/reparse-listings.ts
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { computeUnitPrice, variantLabel } from '@repo/matching';
import { parseScraperMessage } from '@repo/contracts';
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

  const changedIds: string[] = [];
  let invalid = 0;
  for (const listing of listings) {
    if (!listing.rawData || listing.currentPrice === null) continue;
    // rawData — збережене повідомлення скрапера: перевіряємо, а не довіряємо типу
    const parsed = parseScraperMessage(JSON.stringify(listing.rawData));
    if (!parsed.ok || parsed.message.kind !== 'product') {
      invalid++;
      continue;
    }
    const quantity = resolveQuantity(parsed.message);
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
    changedIds.push(listing.id);
  }
  // Ціна за одиницю в історії — за тими самими правилами, що computeUnitPrice
  const snapshots = changedIds.length
    ? await prisma.$executeRaw`
        UPDATE price_snapshots s SET "unitPrice" = CASE
          WHEN l.measure IS NULL OR l."netQuantity" IS NULL OR l."netQuantity" <= 0 THEN NULL
          WHEN l."isWeighted" THEN round(s.price, 2)
          WHEN l.measure = 'COUNT' THEN round(s.price / l."netQuantity", 2)
          ELSE round(s.price / l."netQuantity" * 1000, 2)
        END
        FROM listings l
        WHERE l.id = s."listingId" AND l.id = ANY(${changedIds})`
    : 0;
  const variants = await fixVariants(changedIds);
  console.log(
    `Перевірено карток: ${listings.length}, оновлено: ${changedIds.length}, записів історії: ${snapshots}, некоректних rawData: ${invalid}`,
  );
  console.log(
    `Фасувань виправлено: ${variants.fixed}, лишилось на модерацію (картки не згодні між собою або фасування вже є в товарі): ${variants.left.length}`,
  );
  for (const id of variants.left)
    console.log(`  /admin/products → варіант ${id}`);
}

/**
 * Варіант бере фасування з карток (MatchingService), тож після нового розбору
 * він зберігає старе: "Landbrot 1 г" при картці 1000 г. Якщо всі картки варіанта
 * згодні щодо нового фасування і такого ще немає в товарі — переписуємо варіант
 * і видаляємо його ключі блокування (їх перебудує syncKeys на початку батча).
 */
async function fixVariants(changedIds: string[]) {
  const touched = await prisma.listing.findMany({
    where: { id: { in: changedIds }, variantId: { not: null } },
    select: { variantId: true },
    distinct: ['variantId'],
  });
  let fixed = 0;
  const left: string[] = [];
  for (const { variantId } of touched) {
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId! },
      select: {
        productId: true,
        measure: true,
        netQuantity: true,
        packCount: true,
        isWeighted: true,
        listings: {
          select: {
            measure: true,
            netQuantity: true,
            packCount: true,
            isWeighted: true,
          },
        },
      },
    });
    const keyOf = (q: {
      measure: string | null;
      netQuantity: unknown;
      packCount: number | null;
      isWeighted: boolean;
    }) =>
      [
        q.measure,
        q.netQuantity === null ? null : Number(q.netQuantity),
        q.packCount ?? 1,
        q.isWeighted,
      ].join('|');
    const keys = new Set(variant.listings.map(keyOf));
    if (keys.size !== 1 || keys.has(keyOf(variant))) {
      if (!keys.has(keyOf(variant))) left.push(variantId!);
      continue;
    }
    const q = variant.listings[0];
    const quantity = {
      measure: q.measure,
      netQuantity: q.netQuantity === null ? null : Number(q.netQuantity),
      packCount: q.packCount ?? 1,
      isWeighted: q.isWeighted,
    };
    const taken = await prisma.productVariant.findFirst({
      where: {
        productId: variant.productId,
        measure: quantity.measure,
        netQuantity: quantity.netQuantity,
        packCount: quantity.packCount,
      },
      select: { id: true },
    });
    if (taken) {
      left.push(variantId!);
      continue;
    }
    await prisma.$transaction([
      prisma.productVariant.update({
        where: { id: variantId! },
        data: { ...quantity, label: variantLabel(quantity) },
      }),
      prisma.matchKey.deleteMany({ where: { variantId: variantId! } }),
    ]);
    fixed++;
  }
  return { fixed, left };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

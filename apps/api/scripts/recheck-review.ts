// Перевірка черги модерації після зміни правил зіставлення (PRD-30).
//
// Пакет зіставлення не чіпає картки, які вже чекають модератора (є кандидати
// SUGGESTED), тож нові правила не впливають на чергу. Скрипт перераховує кожну
// запропоновану пару поточним алгоритмом (вивчені варіації, слова вибору) і
// показує пари, що тепер нижчі за поріг модерації. Картки без жодного кандидата
// повертаються в наступний пакет зіставлення й отримують рішення заново.
//
// Рахуються лише пари, без правила "сусіднього смаку" (CatalogIndex.decide),
// тож результат обережний: відкидається не більше, ніж відкинув би пакет.
//
// Запуск: bun scripts/recheck-review.ts [--write]
//   без --write — лише звіт; з --write — видаляє ці пропозиції (рішення модераторів,
//   ACCEPTED / REJECTED, не змінюються) і ставить запит на зіставлення.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { MATCHING_REQUESTS_QUEUE } from '@repo/contracts';
import {
  brandKey,
  buildIdf,
  extractFeatures,
  applyOverrides,
  learnVariations,
  NameFeatures,
  prepareListings,
  scorePair,
  THRESHOLDS,
  variationGroup,
} from '@repo/matching';
import { createRedis } from '../src/redis';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const write = process.argv.includes('--write');
  const rows = await prisma.listing.findMany({
    select: {
      id: true,
      chainId: true,
      rawName: true,
      rawBrand: true,
      barcodes: true,
      measure: true,
      netQuantity: true,
      packCount: true,
      isWeighted: true,
      delistedAt: true,
      variantId: true,
      chain: { select: { countryCode: true, slug: true } },
    },
  });
  // Ознаки, IDF і варіації — як у воркері
  const { inputs, vocabulary } = prepareListings(
    rows.map((r) => ({
      ...r,
      country: r.chain.countryCode,
      netQuantity: r.netQuantity === null ? null : Number(r.netQuantity),
    })),
  );
  const variations = applyOverrides(
    learnVariations(
      rows
        .filter((r) => r.delistedAt === null)
        .map((r) => {
          const l = inputs.get(r.id)!;
          return {
            chainId: l.chainId,
            group: variationGroup(brandKey(r.rawBrand), l.quantity),
            tokens: l.features.tokens.map((t) => t.norm),
            barcodes: l.barcodes,
          };
        }),
    ),
    await prisma.variationOverride.findMany(),
  );
  const idfs = new Map(
    [...vocabulary].map(([country, docs]) => [country, buildIdf(docs)]),
  );
  const linked = new Map<string, NameFeatures[]>();
  for (const r of rows) {
    if (!r.variantId) continue;
    linked.set(r.variantId, [
      ...(linked.get(r.variantId) ?? []),
      inputs.get(r.id)!.features,
    ]);
  }
  const names = new Map(
    rows.map((r) => [r.id, `[${r.chain.slug}] ${r.rawName}`]),
  );

  const candidates = await prisma.matchCandidate.findMany({
    where: { status: 'SUGGESTED', variantId: { not: null } },
    select: {
      id: true,
      listingId: true,
      variantId: true,
      score: true,
      variant: {
        select: {
          product: {
            select: { name: true, brand: { select: { name: true } } },
          },
        },
      },
    },
  });

  const stale: string[] = [];
  const queued = new Set<string>();
  const kept = new Set<string>();
  const reasons = new Map<string, number>();
  for (const c of candidates) {
    queued.add(c.listingId);
    const listing = inputs.get(c.listingId);
    if (!listing || !c.variant) continue;
    const product = c.variant.product;
    const variantNames = [
      extractFeatures(product.name, product.brand?.name),
      ...(linked.get(c.variantId!) ?? []),
    ];
    const idf = idfs.get(listing.country)!;
    const best = variantNames
      .map((n) => scorePair(listing.features, n, idf, variations))
      .sort((a, b) => b.score - a.score)[0];
    if (best.score >= THRESHOLDS.review) {
      kept.add(c.listingId);
      continue;
    }
    stale.push(c.id);
    const reason = best.conflict ?? 'нижче порогу';
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    console.log(
      `  ${names.get(c.listingId)}  ⟷  ${product.name}  ${c.score.toFixed(2)} → ${best.score.toFixed(2)} (${reason})`,
    );
  }

  console.log(`\nВивчених варіацій: ${variations.size}`);
  console.log(
    `Пропозицій: ${candidates.length}, застарілих: ${stale.length} (${[...reasons].map(([r, n]) => `${r} ${n}`).join(', ')})`,
  );
  console.log(
    `Карток у черзі: ${queued.size}, лишаються з кандидатом: ${kept.size}, повернуться в зіставлення: ${queued.size - kept.size}`,
  );
  if (!write) {
    console.log('\nЛише звіт. З --write пропозиції буде видалено.');
    return;
  }

  const { count } = await prisma.matchCandidate.deleteMany({
    // Модератор міг вирішити пару, поки скрипт рахував
    where: { id: { in: stale }, status: 'SUGGESTED' },
  });
  const redis = createRedis();
  try {
    await redis.lpush(MATCHING_REQUESTS_QUEUE, new Date().toISOString());
  } finally {
    redis.disconnect();
  }
  console.log(
    `\nВидалено пропозицій: ${count}. Запит на зіставлення поставлено (працює воркер).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

// AUD-02: скільки пар правила відхилили даремно (хибно негативні рішення).
//
// `match_rule_hits` каже лише, що правило вплинуло на рішення, але не кого воно відхилило.
// Тому беремо випадкові картки, для яких воно спрацювало і створився новий товар, і
// повторюємо рішення з вимкненим правилом на поточному каталозі: кандидат, що зʼявився, —
// це і є відхилена пара. Штрихкоди дають відповідь не завжди, решту перевіряють вручну
// (`--out` пише таблицю). Лише читає.
//
// Запуск: bun scripts/rejected-pairs.ts [--pairs 60] [--pool 100000] [--seed 1] [--out <file.tsv>]
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  applyOverrides,
  brandKey,
  buildIdf,
  CatalogIndex,
  learnVariations,
  type ListingInput,
  type MatchDecision,
  type MatchRule,
  prepareListings,
  productFeatures,
  quantityKey,
  unmatchedVariation,
  variationGroup,
} from '@repo/matching';

const RULES: MatchRule[] = [
  'variations',
  'attributes',
  'choice',
  'rangeOffers',
];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function option(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}

/** Фасування або товар, які рішення вибрало б першими; null — кандидата немає */
function target(
  decision: MatchDecision,
): { variantId?: string; productId?: string; score: number } | null {
  if (decision.kind === 'fuzzy') return decision;
  if (decision.kind === 'variant') return decision;
  if (decision.kind === 'review') return decision.candidates[0] ?? null;
  return null;
}

async function main() {
  const pool = Number(option('pool') ?? 100_000);
  const wanted = Number(option('pairs') ?? 60);
  const seed = option('seed') ?? '1';
  const out = option('out');
  const rules = option('rules')?.split(',') as MatchRule[] | undefined;

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
  const { inputs, vocabulary } = prepareListings(
    rows.map((r) => ({
      ...r,
      country: r.chain.countryCode,
      netQuantity: r.netQuantity === null ? null : Number(r.netQuantity),
    })),
    new Map(
      (
        await prisma.brandAlias.findMany({
          select: { alias: true, brand: { select: { slug: true } } },
        })
      ).map((a) => [a.alias, a.brand.slug]),
    ),
  );

  const index = new CatalogIndex();
  for (const [country, docs] of vocabulary) {
    index.setIdf(country, buildIdf(docs));
  }
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
  index.setVariations(variations);

  // Каталог — як у воркері: товар, фасування, штрихкоди, назви зіставлених карток
  const variants = await prisma.productVariant.findMany({
    select: {
      id: true,
      productId: true,
      barcodes: { select: { gtin: true } },
      product: {
        select: {
          name: true,
          brand: { select: { name: true, slug: true } },
        },
      },
    },
  });
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const listingOf = new Map<string, { name: string; tokens: string[] }>();
  for (const r of rows) {
    if (!r.variantId || r.delistedAt !== null) continue;
    const variant = variantById.get(r.variantId);
    if (!variant) continue;
    const input = inputs.get(r.id)!;
    index.addProduct(
      variant.productId,
      productFeatures(variant.product.name, variant.product.brand),
      input.country,
    );
    index.addVariant(
      variant.id,
      variant.productId,
      quantityKey(input.quantity),
    );
    for (const { gtin } of variant.barcodes) index.addBarcode(variant.id, gtin);
    index.addName(variant.id, input.features, input.country, r.chainId);
    if (!listingOf.has(variant.id)) {
      listingOf.set(variant.id, {
        name: r.rawName,
        tokens: input.features.tokens.map((t) => t.norm),
      });
    }
  }
  const productName = new Map(
    variants.map((v) => [v.productId, v.product.name]),
  );

  const byId = new Map(rows.map((r) => [r.id, r]));
  if (out) {
    writeFileSync(
      out,
      'rule\tverdict\tscore\tmine\ttheirs\tchain\tlisting\tcandidate_product\tcandidate_listing\n',
    );
  }
  console.log(
    '| Правило | Карток (новий товар) | Перевірено | Зʼявилась пара | Той самий GTIN | Різні GTIN | Без відповіді |',
  );
  console.log('|---|---|---|---|---|---|---|');
  for (const rule of rules ?? RULES) {
    const hits = await prisma.matchRuleHit.findMany({
      where: { rule, decision: 'product' },
      select: { listingId: true },
      distinct: ['listingId'],
    });
    const key = (id: string) =>
      createHash('sha1')
        .update(seed + id)
        .digest('hex');
    const sample = hits
      .map((h) => h.listingId)
      .filter((id) => byId.get(id)?.variantId)
      .sort((a, b) => key(a).localeCompare(key(b)))
      .slice(0, pool);

    const tally = { checked: 0, pairs: 0, same: 0, different: 0, unknown: 0 };
    for (const id of sample) {
      if (tally.pairs >= wanted) break;
      tally.checked++;
      const listing: ListingInput = inputs.get(id)!;
      const own = variantById.get(byId.get(id)!.variantId!);
      const before = target(index.decide(listing));
      index.setRules({ [rule]: false });
      const after = target(index.decide(listing));
      index.setRules({});
      if (!after) continue;
      if (after.variantId && after.variantId === before?.variantId) continue;
      if (after.productId && after.productId === before?.productId) continue;
      const productId =
        after.productId ?? index.variantOf(after.variantId!)?.productId;
      if (!productId || productId === own?.productId) continue;

      const theirs = after.variantId
        ? variantById.get(after.variantId)?.barcodes.map((b) => b.gtin)
        : [];
      const mine = [
        ...listing.barcodes,
        ...(own?.barcodes.map((b) => b.gtin) ?? []),
      ];
      const verdict =
        !mine.length || !theirs?.length
          ? 'unknown'
          : theirs.some((g) => mine.includes(g))
            ? 'same'
            : 'different';
      tally.pairs++;
      tally[verdict]++;
      // Слова-варіації, які відрізняють назви: з кожного боку або лише з одного
      const words = listing.features.tokens.map((t) => t.norm);
      const candidate = after.variantId ? listingOf.get(after.variantId) : null;
      const line = [
        rule,
        verdict,
        after.score.toFixed(3),
        (candidate &&
          unmatchedVariation(words, candidate.tokens, variations)) ??
          '',
        (candidate &&
          unmatchedVariation(candidate.tokens, words, variations)) ??
          '',
        byId.get(id)!.chain.slug,
        byId.get(id)!.rawName,
        productName.get(productId) ?? '',
        candidate?.name ?? '',
      ].join('\t');
      if (out) appendFileSync(out, line + '\n');
    }
    console.log(
      `| ${rule} | ${hits.length} | ${tally.checked} | ${tally.pairs} | ${tally.same} | ${tally.different} | ${tally.unknown} |`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

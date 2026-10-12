// Експеримент для диплома: якість нечіткого зіставлення на реальних даних.
//
// Еталон — штрихкоди: картки різних мереж з однаковим GTIN точно є одним товаром.
// Прогоняємо той самий алгоритм, що й у MatchingService, але приховуємо від нього
// штрихкоди, і рахуємо попарні метрики (стандарт для задачі entity resolution):
//
//   precision — частка правильних серед пар карток, які алгоритм об'єднав в одне фасування;
//   recall    — частка еталонних пар (спільний GTIN), які алгоритм об'єднав.
//
// "На модерацію" — картки, для яких алгоритм лише запропонував кандидата (0,70–поріг);
// у метриках вони не об'єднані, але показано, скільки з них модератор підтвердив би.
//
// Запуск: bun scripts/evaluate-matching.ts [--errors]
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  CatalogIndex,
  ListingInput,
  quantityKey,
  THRESHOLDS,
} from '../src/modules/catalog/matching/catalog-index';
import { prepareListings } from '../src/modules/catalog/matching/prepare';

const AUTO_LEVELS = [0.8, 0.85, 0.9, 0.95];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const showErrors = process.argv.includes('--errors');
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
      chain: { select: { countryCode: true, slug: true } },
    },
    orderBy: [{ chain: { slug: 'asc' } }, { rawName: 'asc' }],
  });
  const chainSlug = new Map(rows.map((r) => [r.chainId, r.chain.slug]));
  const names = new Map(rows.map((r) => [r.id, r.rawName]));
  // Словник брендів і IDF — за всіма картками, як у робочому зіставленні
  const { inputs, vocabulary } = prepareListings(
    rows.map((r) => ({
      ...r,
      country: r.chain.countryCode,
      netQuantity: r.netQuantity === null ? null : Number(r.netQuantity),
    })),
  );
  // Експеримент — лише на картках зі штрихкодом: для них відома правильна відповідь
  const evaluated = [...inputs.values()].filter((l) => l.barcodes.length > 0);
  const truth = truthPairs(evaluated);

  console.log(`Карток зі штрихкодом: ${evaluated.length}`);
  console.log(`Еталонних пар (той самий GTIN у різних мережах): ${truth.size}`);
  const sameQuantity = [...truth].filter((key) => {
    const [a, b] = key.split('|').map((id) => inputs.get(id)!);
    return quantityKey(a.quantity) === quantityKey(b.quantity);
  }).length;
  console.log(
    `З них з однаковим розпізнаним фасуванням (межа recall через блокування): ${sameQuantity} (${pct(sameQuantity / truth.size)})`,
  );
  console.log('');
  console.log(
    '| Поріг авто | Об’єднано пар | Правильних | Precision | Recall | F1 | На модерацію | З них правильний кандидат |',
  );
  console.log('|---|---|---|---|---|---|---|---|');

  let errorsAtDefault: { text: string; sameName: boolean }[] = [];
  for (const auto of AUTO_LEVELS) {
    const result = simulate(evaluated, vocabulary, { ...THRESHOLDS, auto });
    const predicted = predictedPairs(result.cluster, inputs);
    const correct = [...predicted].filter((p) => truth.has(p)).length;
    const precision = predicted.size ? correct / predicted.size : 0;
    const recall = correct / truth.size;
    const f1 =
      precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    const reviewCorrect = result.reviews.filter((r) =>
      sharesBarcode(r.listing, r.top),
    ).length;
    console.log(
      `| ${auto.toFixed(2)} | ${predicted.size} | ${correct} | ${pct(precision)} | ${pct(recall)} | ${f1.toFixed(3)} | ${result.reviews.length} | ${reviewCorrect} |`,
    );
    if (auto === THRESHOLDS.auto) {
      errorsAtDefault = [...predicted]
        .filter((p) => !truth.has(p))
        .map((p) => {
          const [a, b] = p.split('|');
          return {
            text: `  [${chainSlug.get(inputs.get(a)!.chainId)}] ${names.get(a)}  ⟷  [${chainSlug.get(inputs.get(b)!.chainId)}] ${names.get(b)}`,
            sameName:
              names.get(a)!.trim().toLowerCase() ===
              names.get(b)!.trim().toLowerCase(),
          };
        });
    }
  }

  // Пари з різними GTIN, але однаковою назвою — майже завжди той самий товар
  // з іншим штрихкодом (імпортний і місцевий, нова упаковка): еталон тут помиляється
  const identical = errorsAtDefault.filter((e) => e.sameName).length;
  console.log(
    `\nПри порозі ${THRESHOLDS.auto}: об'єднано ${errorsAtDefault.length} пар з різними GTIN, з них ${identical} — з однаковою назвою (до регістру).`,
  );
  if (showErrors) {
    for (const e of errorsAtDefault.filter((x) => !x.sameName))
      console.log(e.text);
  }
}

/** Пари "id|id" карток різних мереж зі спільним GTIN */
function truthPairs(listings: ListingInput[]): Set<string> {
  const byGtin = new Map<string, ListingInput[]>();
  for (const l of listings) {
    for (const gtin of l.barcodes) {
      // Той самий GTIN — той самий товар і в іншій країні (імпорт)
      const key = gtin;
      byGtin.set(key, [...(byGtin.get(key) ?? []), l]);
    }
  }
  const pairs = new Set<string>();
  for (const group of byGtin.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[i].chainId !== group[j].chainId)
          pairs.add(pairKey(group[i].id, group[j].id));
      }
    }
  }
  return pairs;
}

function sharesBarcode(a: ListingInput, b: ListingInput | undefined): boolean {
  return !!b && a.barcodes.some((g) => b.barcodes.includes(g));
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Той самий порядок рішень, що й у MatchingService, але без штрихкодів */
function simulate(
  listings: ListingInput[],
  vocabulary: Map<string, string[][]>,
  thresholds: typeof THRESHOLDS,
) {
  const index = new CatalogIndex(thresholds);
  for (const [country, docs] of vocabulary) index.setVocabulary(country, docs);
  const cluster = new Map<string, string>();
  const membersOf = new Map<string, ListingInput[]>();
  const reviews: { listing: ListingInput; top: ListingInput | undefined }[] =
    [];
  let next = 0;

  for (const original of listings) {
    const listing = { ...original, barcodes: [] };
    const decision = index.decide(listing);
    let variantId: string;
    if (decision.kind === 'fuzzy') {
      variantId = decision.variantId;
    } else {
      if (decision.kind === 'review') {
        const top = membersOf.get(decision.candidates[0].variantId)?.[0];
        reviews.push({ listing: original, top });
      }
      const productId =
        decision.kind === 'variant' ? decision.productId : `p${next++}`;
      variantId = `v${next++}`;
      index.addProduct(productId, listing.features, listing.country);
      index.addVariant(variantId, productId, quantityKey(listing.quantity));
    }
    index.addName(
      variantId,
      listing.features,
      listing.country,
      listing.chainId,
    );
    cluster.set(listing.id, variantId);
    membersOf.set(variantId, [...(membersOf.get(variantId) ?? []), original]);
  }
  return { cluster, reviews };
}

function predictedPairs(
  cluster: Map<string, string>,
  inputs: Map<string, ListingInput>,
): Set<string> {
  const groups = new Map<string, string[]>();
  for (const [listingId, variantId] of cluster) {
    groups.set(variantId, [...(groups.get(variantId) ?? []), listingId]);
  }
  const pairs = new Set<string>();
  for (const ids of groups.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (inputs.get(ids[i])!.chainId !== inputs.get(ids[j])!.chainId) {
          pairs.add(pairKey(ids[i], ids[j]));
        }
      }
    }
  }
  return pairs;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)} %`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

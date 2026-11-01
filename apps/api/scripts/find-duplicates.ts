// Дублікати товарів у каталозі (AUDIT AUD-03): та сама річ, розділена на два товари.
//
// match:evaluate бачить лише картки зі штрихкодом; тут — увесь каталог. Кандидати
// відбирає PostgreSQL (pg_trgm): фасування двох різних товарів однієї країни з тим
// самим фасуванням (або фасування невідоме з одного боку), тим самим чи схожим за
// написанням брендом і схожими назвами, які продають різні мережі (якщо обидва
// товари є в одній мережі — мережа сама вважає їх різними). Далі кожну пару оцінює
// рушій зіставлення (scorePair) — за назвою товару й усіма назвами його карток,
// з тими самими IDF і вивченими варіаціями, що й у воркері. Бренди, записані
// по-різному, порівнюються як один бренд.
//
// Пари, які модератор уже відхилив (match_candidates REJECTED), не рахуються.
//
// Ймовірний дублікат — оцінка ≥ порогу авто (рушій обʼєднав би пару, якби не
// причина нижче), можливий — у смузі модерації. Причина — що завадило злиттю:
//   brand     — бренди записано по-різному (рушій вважає їх різними товарами);
//   quantity  — фасування не розпізнано з одного боку (інший блок кандидатів);
//   engine    — бренд і фасування ті самі: товар створено раніше, ніж зʼявилися
//               потрібні картки чи правила, або пара чекає модератора.
// Не дублікати: conflict — правило вважає товари різними (ознаки, варіації, вибір;
// матеріал для AUD-02), нижче модерації — назви схожі лише за літерами.
//
// Запуск: bun scripts/find-duplicates.ts [--list]
//   --list — усі ймовірні й можливі дублікати, інакше — 15 прикладів
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import {
  applyOverrides,
  brandKey,
  buildIdf,
  learnVariations,
  NameFeatures,
  PairScore,
  prepareListings,
  productFeatures,
  scorePair,
  THRESHOLDS,
  variationGroup,
} from '@repo/matching';

/** Нижня межа схожості назв pg_trgm для кандидатів: далі вирішує рушій */
const NAME_TRGM = 0.5;
/** Схожість назв брендів, з якої вважаємо, що це може бути той самий бренд */
const BRAND_TRGM = 0.6;
const CAUSES = ['brand', 'quantity', 'engine'] as const;
type Cause = (typeof CAUSES)[number];

interface PairRow {
  a: string;
  b: string;
  country: string;
  sameBrand: boolean;
  sameQuantity: boolean;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const listAll = process.argv.includes('--list');
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
  // Ознаки, IDF і варіації — як у воркері (див. recheck-review.ts)
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
  const chainsOf = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.variantId) continue;
    linked.set(r.variantId, [
      ...(linked.get(r.variantId) ?? []),
      inputs.get(r.id)!.features,
    ]);
    if (r.delistedAt === null) {
      const set = chainsOf.get(r.variantId) ?? new Set<string>();
      set.add(r.chain.slug);
      chainsOf.set(r.variantId, set);
    }
  }
  const variantOf = new Map(rows.map((r) => [r.id, r.variantId]));
  const rejected = new Set(
    (
      await prisma.matchCandidate.findMany({
        where: { status: 'REJECTED', variantId: { not: null } },
        select: { listingId: true, variantId: true },
      })
    ).flatMap((c) => {
      const own = variantOf.get(c.listingId);
      return own ? [pairKey(own, c.variantId!)] : [];
    }),
  );

  const started = Date.now();
  // Пари товарів — через GIN-індекс products.name (оператор % з порогом 0,3 за
  // замовчуванням), далі фасування з живими картками
  const pairs = await prisma.$queryRaw<PairRow[]>(Prisma.sql`
    WITH pp AS (
      SELECT x.id AS a, y.id AS b,
             x."brandId" IS NOT DISTINCT FROM y."brandId" AS "sameBrand"
      FROM products x
      JOIN products y ON x.id < y.id AND x.name % y.name
        AND similarity(x.name, y.name) >= ${NAME_TRGM}
      LEFT JOIN brands bx ON bx.id = x."brandId"
      LEFT JOIN brands bY ON bY.id = y."brandId"
      WHERE x."brandId" IS NOT DISTINCT FROM y."brandId"
         OR similarity(bx.name, bY.name) >= ${BRAND_TRGM}
    ), v AS (
      SELECT pv.id, pv."productId", pv.measure, pv."netQuantity", pv."packCount",
             array_agg(DISTINCT l."chainId") AS chains, c."countryCode" AS country
      FROM product_variants pv
      JOIN listings l ON l."variantId" = pv.id AND l."delistedAt" IS NULL
      JOIN store_chains c ON c.id = l."chainId"
      WHERE pv."productId" IN (SELECT a FROM pp UNION SELECT b FROM pp)
      GROUP BY pv.id, c."countryCode"
    )
    SELECT x.id AS a, y.id AS b, x.country, pp."sameBrand",
           x.measure IS NOT DISTINCT FROM y.measure
             AND x."netQuantity" IS NOT DISTINCT FROM y."netQuantity"
             AND x."packCount" = y."packCount" AS "sameQuantity"
    FROM pp
    JOIN v x ON x."productId" = pp.a
    JOIN v y ON y."productId" = pp.b AND y.country = x.country
    WHERE NOT (x.chains && y.chains)
      AND ((x.measure IS NOT DISTINCT FROM y.measure
            AND x."netQuantity" IS NOT DISTINCT FROM y."netQuantity"
            AND x."packCount" = y."packCount")
           OR (x.measure IS NULL) <> (y.measure IS NULL))
  `);
  const sqlMs = Date.now() - started;

  const ids = [...new Set(pairs.flatMap((p) => [p.a, p.b]))];
  const variants = new Map(
    (
      await prisma.productVariant.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          label: true,
          product: {
            select: {
              id: true,
              name: true,
              brand: { select: { name: true, slug: true } },
              category: { select: { name: true } },
            },
          },
        },
      })
    ).map((v) => [v.id, v]),
  );

  const scored: { pair: PairRow; cause: Cause; score: PairScore }[] = [];
  let skippedRejected = 0;
  for (const pair of pairs) {
    if (rejected.has(pairKey(pair.a, pair.b))) {
      skippedRejected++;
      continue;
    }
    const a = variants.get(pair.a)!;
    const b = variants.get(pair.b)!;
    const idf = idfs.get(pair.country)!;
    const namesA = [
      productFeatures(a.product.name, a.product.brand),
      ...(linked.get(a.id) ?? []),
    ];
    // Бренд, записаний інакше: порівнюємо так, ніби бренд той самий
    const namesB = [
      productFeatures(b.product.name, b.product.brand),
      ...(linked.get(b.id) ?? []),
    ].map((f) => (pair.sameBrand ? f : { ...f, brand: namesA[0].brand }));
    const score = best(
      namesA.flatMap((x) =>
        namesB.map((y) => scorePair(x, y, idf, variations)),
      ),
    );
    const cause = !pair.sameBrand
      ? 'brand'
      : !pair.sameQuantity
        ? 'quantity'
        : 'engine';
    scored.push({ pair, cause, score });
  }

  const likely = scored.filter(
    (r) => !r.score.conflict && r.score.score >= THRESHOLDS.auto,
  );
  const possible = scored.filter(
    (r) =>
      !r.score.conflict &&
      r.score.score >= THRESHOLDS.review &&
      r.score.score < THRESHOLDS.auto,
  );
  const conflicts = count(
    scored.filter((r) => r.score.conflict).map((r) => r.score.conflict!),
  );
  const conflicted = [...conflicts.values()].reduce((s, n) => s + n, 0);
  const below = scored.length - likely.length - possible.length - conflicted;
  const variantCount = await prisma.productVariant.count({
    where: { listings: { some: { delistedAt: null } } },
  });
  const dupVariants = new Set(likely.flatMap((r) => [r.pair.a, r.pair.b]));

  console.log(`Вивчених варіацій: ${variations.size}`);
  console.log(
    `Пар-кандидатів (pg_trgm ≥ ${NAME_TRGM}): ${pairs.length} за ${sqlMs} мс; відхилено модератором: ${skippedRejected}`,
  );
  console.log(
    `\nЙмовірних дублікатів (≥ ${THRESHOLDS.auto}): ${likely.length} пар, ${dupVariants.size} фасувань з ${variantCount} живих (${pct(dupVariants.size / variantCount)})`,
  );
  console.log(
    `Можливих (${THRESHOLDS.review}–${THRESHOLDS.auto}): ${possible.length} пар`,
  );
  console.log(
    `Не дублікати: правило розрізняє — ${conflicted} (${[...conflicts].map(([k, n]) => `${k} ${n}`).join(', ')}), нижче модерації — ${below}\n`,
  );
  console.log('| Що завадило злиттю | Ймовірних | Можливих |');
  console.log('|---|---|---|');
  for (const cause of CAUSES) {
    console.log(
      `| ${cause} | ${likely.filter((r) => r.cause === cause).length} | ${possible.filter((r) => r.cause === cause).length} |`,
    );
  }

  // Частка фасувань мережі, що мають ймовірний дублікат
  const perChain = new Map<string, { all: number; dup: number }>();
  for (const chains of chainsOf.values()) {
    for (const chain of chains) {
      const entry = perChain.get(chain) ?? { all: 0, dup: 0 };
      entry.all++;
      perChain.set(chain, entry);
    }
  }
  for (const id of dupVariants) {
    for (const chain of chainsOf.get(id) ?? []) perChain.get(chain)!.dup++;
  }
  console.log('\n| Мережа | Фасувань | З ймовірним дублікатом | Частка |');
  console.log('|---|---|---|---|');
  for (const [chain, e] of [...perChain].sort(
    (x, y) => y[1].dup / y[1].all - x[1].dup / x[1].all,
  )) {
    console.log(`| ${chain} | ${e.all} | ${e.dup} | ${pct(e.dup / e.all)} |`);
  }

  const perCategory = count(
    likely.map(
      (r) => variants.get(r.pair.a)!.product.category?.name ?? 'без категорії',
    ),
  );
  console.log('\n| Категорія | Ймовірних пар |');
  console.log('|---|---|');
  for (const [category, n] of [...perCategory].sort((x, y) => y[1] - x[1])) {
    console.log(`| ${category} | ${n} |`);
  }

  const show = (title: string, items: typeof scored) => {
    console.log(`\n${title}:`);
    for (const r of (listAll ? items : sample(items, 15)).sort(
      (x, y) => y.score.score - x.score.score,
    )) {
      console.log(
        `  ${r.cause.padEnd(8)} ${r.score.score.toFixed(2)}  ${describe(variants.get(r.pair.a)!, chainsOf)}  ⟷  ${describe(variants.get(r.pair.b)!, chainsOf)}`,
      );
    }
  };
  show('Ймовірні дублікати', likely);
  show('Можливі дублікати', possible);
}

/** Найкраща оцінка; якщо всі пари назв у конфлікті — перший конфлікт */
function best(scores: PairScore[]): PairScore {
  const clean = scores.filter((s) => !s.conflict);
  if (!clean.length) return scores[0];
  return clean.reduce((x, y) => (y.score > x.score ? y : x));
}

function describe(
  v: { id: string; label: string; product: { name: string } },
  chainsOf: Map<string, Set<string>>,
): string {
  return `${v.product.name} ${v.label} [${[...(chainsOf.get(v.id) ?? [])].join(', ')}]`;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function count<T>(items: T[]): Map<T, number> {
  const map = new Map<T, number>();
  for (const item of items) map.set(item, (map.get(item) ?? 0) + 1);
  return map;
}

function sample<T>(items: T[], n: number): T[] {
  const step = Math.max(1, Math.floor(items.length / n));
  return items.filter((_, i) => i % step === 0).slice(0, n);
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

// PRD-32, крок 1: які графіки найкраще показують хибні дані (лише читання БД).
//
// Еталон — штучні помилки, підкинуті в копії справжніх карток (БД не змінюється):
//   kopecks    ціна ×100 (zakaz.ua віддає копійки);
//   grams      0,5 кг прочитано як 0,5 г → ціна за кг ×1000;
//   multipack  ціна за штуку, а фасування — весь мультипак (6 шт) → ціна за кг ÷6;
//   wrongSize  картку іншого фасування приєднано до цього (ціна ×2, ціна за кг та сама);
//   oldPrice   закреслена ціна нижча за поточну.
// Кожен тип підкидається окремо (по N карток), і для кожного детектора (≈ графіка)
// рахується частка знайдених і кількість хибних тривог на чистих даних.
// Справжній еталон — рішення модераторів: відхилені й прийняті пари зіставлення.
//
// Запуск: bun scripts/quality-research.ts [--html <файл>] [--n 100]
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { conceptOf } from '@repo/matching';
import {
  findOutliers,
  median,
  OUTLIER_RULES,
} from '../src/modules/quality/outliers';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface Row {
  id: string;
  chain: string;
  country: string;
  name: string;
  measure: string | null;
  qty: number | null;
  pack: number;
  weighted: boolean;
  price: number;
  regular: number | null;
  unit: number | null;
  variantId: string | null;
  productId: string | null;
  category: string | null;
  concept: string | null;
}

type Detector = {
  name: string;
  chart: string;
  run: (rows: Row[]) => Set<string>;
};

const ln = Math.log;
const ids = <T extends { item: Row }>(list: T[]) =>
  new Set(list.map((o) => o.item.id));
const unitGroup = (r: Row) =>
  r.category && r.measure ? `${r.category}|${r.country}|${r.measure}` : null;
const logUnit = (r: Row) => (r.unit && r.unit > 0 ? ln(r.unit) : null);

/** Ціна картки ÷ медіана цін інших карток того самого фасування в цій країні */
function variantRatios(rows: Row[]): Map<string, number> {
  const byVariant = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.variantId) continue;
    const key = `${r.variantId}|${r.country}`;
    byVariant.set(key, [...(byVariant.get(key) ?? []), r]);
  }
  const ratios = new Map<string, number>();
  for (const group of byVariant.values()) {
    if (group.length < 2) continue;
    for (const r of group) {
      const others = group.filter((o) => o.id !== r.id).map((o) => o.price);
      ratios.set(r.id, r.price / median(others));
    }
  }
  return ratios;
}

/**
 * Ціна за кг картки ÷ медіана ціни за кг інших фасувань того самого товару в країні
 * (більша упаковка зазвичай дешевша на 10–40 %, не вдвічі)
 */
function productUnitRatios(rows: Row[]): Map<string, number> {
  const byProduct = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.productId || !r.unit || !r.variantId) continue;
    const key = `${r.productId}|${r.country}|${r.measure}`;
    byProduct.set(key, [...(byProduct.get(key) ?? []), r]);
  }
  const ratios = new Map<string, number>();
  for (const group of byProduct.values()) {
    for (const r of group) {
      const others = group
        .filter((o) => o.variantId !== r.variantId)
        .map((o) => o.unit!);
      if (others.length) ratios.set(r.id, r.unit! / median(others));
    }
  }
  return ratios;
}

/** Залишки log(ціна за кг) після прямої від log(розмір) у кожній групі */
function logLogResiduals(rows: Row[]): Map<string, number> {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const g = unitGroup(r);
    if (!g || !r.unit || !r.qty || r.weighted) continue;
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  const residuals = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.length < OUTLIER_RULES.minGroup) continue;
    const xs = group.map((r) => ln(r.qty! / r.pack));
    const ys = group.map((r) => ln(r.unit!));
    // Пряма через медіани половин (стійка до викидів, на відміну від МНК)
    const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
    const half = order.length >> 1;
    const left = order.slice(0, half);
    const right = order.slice(order.length - half);
    const mx = (s: number[]) => median(s.map((i) => xs[i]));
    const my = (s: number[]) => median(s.map((i) => ys[i]));
    const slope =
      mx(right) === mx(left)
        ? 0
        : (my(right) - my(left)) / (mx(right) - mx(left));
    const intercept = median(ys.map((y, i) => y - slope * xs[i]));
    group.forEach((r, i) =>
      residuals.set(r.id, ys[i] - (intercept + slope * xs[i])),
    );
  }
  return residuals;
}

const DETECTORS: Detector[] = [
  {
    name: 'unit-linear',
    chart: 'ціна за кг/л/шт, лінійна шкала, група категорія+країна+одиниця',
    run: (rows) => ids(findOutliers(rows, unitGroup, (r) => r.unit)),
  },
  {
    name: 'unit-log',
    chart: 'ціна за кг/л/шт, логарифмічна шкала, та сама група',
    run: (rows) => ids(findOutliers(rows, unitGroup, logUnit)),
  },
  {
    name: 'unit-log-concept',
    chart: 'ціна за кг/л/шт, лог., група поняття (PRD-19)+країна+одиниця',
    run: (rows) =>
      ids(
        findOutliers(
          rows,
          (r) =>
            r.concept && r.measure
              ? `${r.concept}|${r.country}|${r.measure}`
              : null,
          logUnit,
        ),
      ),
  },
  {
    name: 'loglog-residual',
    chart: 'ціна за кг від розміру, log–log, відхилення від прямої групи',
    run: (rows) => {
      const res = logLogResiduals(rows);
      const items = rows.filter((r) => res.has(r.id));
      return ids(findOutliers(items, unitGroup, (r) => res.get(r.id)!));
    },
  },
  {
    name: 'variant-ratio-2',
    chart: 'ціна ÷ медіана ціни фасування в інших мережах, межа ×2',
    run: (rows) => {
      const ratios = variantRatios(rows);
      return new Set(
        [...ratios]
          .filter(([, q]) => Math.abs(ln(q)) > ln(2))
          .map(([id]) => id),
      );
    },
  },
  {
    name: 'variant-ratio-1.6',
    chart: 'те саме, межа ×1,6',
    run: (rows) => {
      const ratios = variantRatios(rows);
      return new Set(
        [...ratios]
          .filter(([, q]) => Math.abs(ln(q)) > ln(1.6))
          .map(([id]) => id),
      );
    },
  },
  {
    name: 'product-unit-2',
    chart: 'ціна за кг ÷ медіана ціни за кг інших фасувань товару, межа ×2',
    run: (rows) =>
      new Set(
        [...productUnitRatios(rows)]
          .filter(([, q]) => Math.abs(ln(q)) > ln(2))
          .map(([id]) => id),
      ),
  },
  {
    name: 'tiny-pack',
    chart: 'розмір упаковки по мережах (лог.): менше 5 г / 5 мл',
    run: (rows) =>
      new Set(
        rows
          .filter(
            (r) =>
              r.qty !== null &&
              r.measure !== 'COUNT' &&
              !r.weighted &&
              r.qty / r.pack < 5,
          )
          .map((r) => r.id),
      ),
  },
  {
    name: 'discount',
    chart: 'знижка %: закреслена ≤ поточної або знижка > 70 %',
    run: (rows) =>
      new Set(
        rows
          .filter(
            (r) =>
              r.regular !== null &&
              (r.regular <= r.price || (r.regular - r.price) / r.regular > 0.7),
          )
          .map((r) => r.id),
      ),
  },
];

type Plant = {
  name: string;
  eligible: (r: Row, ratios: Map<string, number>) => boolean;
  spoil: (r: Row) => Row;
};

const PLANTS: Plant[] = [
  {
    name: 'kopecks',
    eligible: (r) => r.unit !== null,
    spoil: (r) => ({
      ...r,
      price: r.price * 100,
      unit: r.unit! * 100,
      regular: r.regular && r.regular * 100,
    }),
  },
  {
    name: 'grams',
    eligible: (r) => r.unit !== null && !r.weighted && r.measure !== 'COUNT',
    spoil: (r) => ({ ...r, qty: r.qty! / 1000, unit: r.unit! * 1000 }),
  },
  {
    name: 'multipack',
    eligible: (r) => r.unit !== null && !r.weighted && r.pack === 1,
    spoil: (r) => ({ ...r, qty: r.qty! * 6, pack: 6, unit: r.unit! / 6 }),
  },
  {
    name: 'wrongSize',
    eligible: (r, ratios) => ratios.has(r.id),
    spoil: (r) => ({
      ...r,
      price: r.price * 2,
      regular: r.regular && r.regular * 2,
    }),
  },
  {
    name: 'oldPrice',
    eligible: () => true,
    spoil: (r) => ({ ...r, regular: Math.round(r.price * 80) / 100 }),
  },
];

/** Детермінований генератор (mulberry32): однакові вибірки між запусками */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample<T>(list: T[], n: number, random: () => number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

async function load(): Promise<Row[]> {
  const raw = await prisma.$queryRaw<
    (Omit<Row, 'concept'> & { pack: number | null })[]
  >`
    SELECT l.id, c.slug AS chain, c."countryCode" AS country, l."rawName" AS name,
      l.measure::text AS measure, l."netQuantity"::float AS qty, l."packCount" AS pack,
      l."isWeighted" AS weighted, l."currentPrice"::float AS price,
      l."regularPrice"::float AS regular, l."unitPrice"::float AS unit,
      l."variantId", v."productId", cat.slug AS category
    FROM listings l
    JOIN store_chains c ON c.id = l."chainId"
    LEFT JOIN product_variants v ON v.id = l."variantId"
    LEFT JOIN products p ON p.id = v."productId"
    LEFT JOIN categories cat ON cat.id = p."categoryId"
    WHERE l."delistedAt" IS NULL AND l."currentPrice" IS NOT NULL AND l."inStock"`;
  return raw.map((r) => ({
    ...r,
    pack: r.pack ?? 1,
    concept: conceptOf(r.name, r.category),
  }));
}

async function main() {
  const htmlPath = process.argv[process.argv.indexOf('--html') + 1];
  const nArg = process.argv.indexOf('--n');
  const n = nArg > 0 ? Number(process.argv[nArg + 1]) : 100;
  const rows = await load();
  const ratios = variantRatios(rows);
  console.log(
    `Активних карток з ціною: ${rows.length}; з ціною за одиницю і категорією: ${rows.filter((r) => unitGroup(r) && r.unit).length}; з поняттям: ${rows.filter((r) => r.concept).length}; у фасуваннях з ≥ 2 картками країни: ${ratios.size}\n`,
  );

  // Хибні тривоги — на чистих даних (серед них є й справжні помилки)
  const clean = new Map(DETECTORS.map((d) => [d.name, d.run(rows)]));
  const recall = new Map<string, Map<string, string>>();
  for (const plant of PLANTS) {
    const random = rng(32);
    const victims = sample(
      rows.filter((r) => plant.eligible(r, ratios)),
      n,
      random,
    );
    const spoiled = new Map(victims.map((r) => [r.id, plant.spoil(r)]));
    const dirty = rows.map((r) => spoiled.get(r.id) ?? r);
    const byDetector = new Map<string, string>();
    for (const d of DETECTORS) {
      const found = d.run(dirty);
      const hit = victims.filter((v) => found.has(v.id)).length;
      byDetector.set(d.name, `${Math.round((100 * hit) / victims.length)} %`);
    }
    recall.set(`${plant.name} (${victims.length})`, byDetector);
  }

  // Справжні помилки в даних (30.10.2026): "1 kg" / "1 l" записано як 1 г / 1 мл
  // (ALDI Nord, PENNY), доза "500 мг" прийнята за фасування (Сільпо, Solgar)
  const real = rows.filter(
    (r) =>
      r.qty !== null && r.measure !== 'COUNT' && !r.weighted && r.qty < 1.5,
  );
  const byDetector = new Map<string, string>();
  for (const d of DETECTORS) {
    const hit = real.filter((r) => clean.get(d.name)!.has(r.id)).length;
    byDetector.set(d.name, `${Math.round((100 * hit) / real.length)} %`);
  }
  recall.set(`справжні 1 г/1 мл (${real.length})`, byDetector);

  const plantNames = [...recall.keys()];
  console.log(
    `| Детектор | ${plantNames.join(' | ')} | Тривог на чистих даних |`,
  );
  console.log(`|---|${plantNames.map(() => '---').join('|')}|---|`);
  // Частка позначених на чистих даних включає й справжні помилки — це верхня межа хибних тривог
  for (const d of DETECTORS) {
    const alarms = clean.get(d.name)!.size;
    console.log(
      `| ${d.name} | ${plantNames.map((p) => recall.get(p)!.get(d.name)).join(' | ')} | ${alarms} (${((100 * alarms) / rows.length).toFixed(1)} %) |`,
    );
  }
  console.log('');
  for (const d of DETECTORS) console.log(`  ${d.name}: ${d.chart}`);

  for (const name of ['unit-log', 'product-unit-2']) {
    console.log(`
Перші позначені справжні картки, ${name}:`);
    for (const r of rows
      .filter((x) => clean.get(name)!.has(x.id))
      .slice(0, 25)) {
      console.log(
        `  [${r.chain}] ${r.name} — ${r.unit} (${r.qty} ${r.measure}, ${unitGroup(r)})`,
      );
    }
  }
  await moderatorDecisions(rows);
  const jumps = await priceJumps();
  const quality = completeness(rows);
  const merged = await overMerged();
  await runs();

  if (process.argv.includes('--html')) {
    writeFileSync(
      htmlPath,
      report(rows, ratios, clean, recall, jumps, quality, merged),
    );
    console.log(`\nГрафіки: ${htmlPath}`);
  }
}

/** Справжній еталон: відхилені модератором пари проти прийнятих */
async function moderatorDecisions(rows: Row[]) {
  const decided = await prisma.matchCandidate.findMany({
    where: {
      status: { in: ['ACCEPTED', 'REJECTED'] },
      variantId: { not: null },
    },
    select: { listingId: true, variantId: true, status: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const prices = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.variantId)
      prices.set(r.variantId, [...(prices.get(r.variantId) ?? []), r]);
  }
  const stats = { ACCEPTED: [] as number[], REJECTED: [] as number[] };
  for (const d of decided) {
    const listing = byId.get(d.listingId);
    if (!listing) continue;
    const others = (prices.get(d.variantId!) ?? []).filter(
      (o) => o.id !== listing.id && o.country === listing.country,
    );
    if (others.length === 0) continue;
    stats[d.status as 'ACCEPTED' | 'REJECTED'].push(
      listing.price / median(others.map((o) => o.price)),
    );
  }
  console.log(
    '\nРішення модераторів: ціна картки ÷ медіана ціни запропонованого фасування',
  );
  for (const [status, list] of Object.entries(stats)) {
    if (!list.length) continue;
    const off = (k: number) =>
      list.filter((q) => Math.abs(ln(q)) > ln(k)).length;
    console.log(
      `  ${status}: ${list.length} пар, медіана |відхилення| ×${Math.exp(median(list.map((q) => Math.abs(ln(q))))).toFixed(2)}, за межею ×1,6: ${off(1.6)}, ×2: ${off(2)}`,
    );
  }
}

/** Стрибки ціни між сусідніми знімками картки більше ніж утричі */
async function priceJumps() {
  const jumps = await prisma.$queryRaw<
    { chain: string; name: string; prev: number; price: number; at: Date }[]
  >`
    SELECT c.slug AS chain, l."rawName" AS name, s.prev::float AS prev,
      s.price::float AS price, s."capturedAt" AS at
    FROM (
      SELECT "listingId", price, "capturedAt",
        lag(price) OVER (PARTITION BY "listingId" ORDER BY "capturedAt") AS prev
      FROM price_snapshots
    ) s
    JOIN listings l ON l.id = s."listingId"
    JOIN store_chains c ON c.id = l."chainId"
    WHERE s.prev IS NOT NULL AND s.prev > 0 AND s.price > 0
      AND (s.price / s.prev > 3 OR s.prev / s.price > 3)
    ORDER BY greatest(s.price / s.prev, s.prev / s.price) DESC`;
  const pairs = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM (
      SELECT lag(price) OVER (PARTITION BY "listingId" ORDER BY "capturedAt") AS prev
      FROM price_snapshots) s WHERE prev IS NOT NULL`;
  console.log(
    `\nІсторія: змін ціни ${pairs[0].n}, стрибків > ×3: ${jumps.length}`,
  );
  for (const j of jumps.slice(0, 10)) {
    console.log(`  [${j.chain}] ${j.name}: ${j.prev} → ${j.price}`);
  }
  return jumps;
}

/** Частка карток без ознаки, по мережах */
function completeness(rows: Row[]) {
  const fields = {
    'ціни за одиницю': (r: Row) => r.unit === null,
    фасування: (r: Row) => r.qty === null,
    категорії: (r: Row) => r.category === null,
    фасування_в_каталозі: (r: Row) => r.variantId === null,
  };
  const chains = [...new Set(rows.map((r) => r.chain))].sort();
  const table = chains.map((chain) => {
    const list = rows.filter((r) => r.chain === chain);
    return {
      chain,
      n: list.length,
      missing: Object.fromEntries(
        Object.entries(fields).map(([k, f]) => [
          k,
          Math.round((100 * list.filter(f).length) / list.length),
        ]),
      ),
    };
  });
  console.log('\nКартки без ознаки, % (по мережах)');
  console.log(`| Мережа | Карток | ${Object.keys(fields).join(' | ')} |`);
  for (const t of table) {
    console.log(
      `| ${t.chain} | ${t.n} | ${Object.values(t.missing).join(' | ')} |`,
    );
  }
  return table;
}

/** Фасування з кількома активними картками однієї мережі: мережа не продає товар двічі */
async function overMerged() {
  const rows = await prisma.$queryRaw<
    { product: string; chain: string; n: number; names: string[] }[]
  >`
    SELECT p.name || ' ' || v.label AS product, c.slug AS chain, count(*)::int AS n,
      array_agg(l."rawName") AS names
    FROM listings l
    JOIN store_chains c ON c.id = l."chainId"
    JOIN product_variants v ON v.id = l."variantId"
    JOIN products p ON p.id = v."productId"
    WHERE l."delistedAt" IS NULL
    GROUP BY v.id, p.name, v.label, c.slug HAVING count(*) > 1
    ORDER BY n DESC`;
  console.log(
    `\nФасування з кількома активними картками однієї мережі: ${rows.length}`,
  );
  for (const r of rows.slice(0, 8)) {
    console.log(
      `  ${r.product} [${r.chain}] ×${r.n}: ${r.names.slice(0, 3).join(' | ')}`,
    );
  }
  return rows;
}

async function runs() {
  const list = await prisma.$queryRaw<
    { chain: string; n: number; seen: number[]; failed: number }[]
  >`
    SELECT c.slug AS chain, count(*)::int AS n,
      array_agg(r."itemsSeen" ORDER BY r."startedAt") AS seen,
      sum(r."itemsFailed")::int AS failed
    FROM scrape_runs r JOIN store_chains c ON c.id = r."chainId"
    WHERE r."maxPages" IS NULL GROUP BY 1 ORDER BY 1`;
  console.log('\nПовні запуски парсерів (itemsSeen по черзі)');
  for (const r of list) {
    console.log(`  ${r.chain}: ${r.seen.join(' → ')}, помилок ${r.failed}`);
  }
}

// ---------- HTML-звіт: власні SVG, як PriceChart.tsx ----------

function report(
  rows: Row[],
  ratios: Map<string, number>,
  clean: Map<string, Set<string>>,
  recall: Map<string, Map<string, string>>,
  jumps: { chain: string; name: string; prev: number; price: number }[],
  quality: ReturnType<typeof completeness>,
  merged: { product: string; chain: string; n: number; names: string[] }[],
): string {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const flagged = clean.get('unit-log')!;
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const g = unitGroup(r);
    if (g && r.unit) groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  const top = [...groups]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 16);

  // 1. Смуги: log ціни за одиницю по групах
  const W = 900,
    rowH = 26,
    left = 210;
  const x = (v: number) => left + ((Math.log10(v) + 1) / 5) * (W - left - 20);
  let strip = `<svg viewBox="0 0 ${W} ${top.length * rowH + 40}" role="img">`;
  for (const p of [0.1, 1, 10, 100, 1000, 10000]) {
    strip += `<line x1="${x(p)}" x2="${x(p)}" y1="10" y2="${top.length * rowH + 10}" class="grid"/><text x="${x(p)}" y="${top.length * rowH + 28}" class="tick">${p}</text>`;
  }
  top.forEach(([g, list], i) => {
    const y = 20 + i * rowH;
    strip += `<text x="${left - 8}" y="${y + 4}" class="label">${esc(g)} (${list.length})</text>`;
    for (const r of list) {
      const bad = flagged.has(r.id);
      strip += `<circle cx="${x(Math.max(r.unit!, 0.1)).toFixed(1)}" cy="${(y + (bad ? 0 : (hash(r.id) - 0.5) * 12)).toFixed(1)}" r="${bad ? 3.5 : 1.8}" class="${bad ? 'bad' : 'dot'}"><title>${esc(`[${r.chain}] ${r.name}: ${r.unit}`)}</title></circle>`;
    }
  });
  strip += '</svg>';

  // 2. Гістограма ln(ціна ÷ медіана фасування)
  const bins = new Array<number>(41).fill(0);
  for (const q of ratios.values()) {
    const b = Math.max(0, Math.min(40, Math.round(Math.log2(q) * 8) + 20));
    bins[b]++;
  }
  const H = 220;
  const maxB = Math.max(...bins);
  const bw = (W - 60) / bins.length;
  let hist = `<svg viewBox="0 0 ${W} ${H + 40}" role="img">`;
  bins.forEach((c, i) => {
    const h = c ? (Math.log10(c + 1) / Math.log10(maxB + 1)) * H : 0;
    const off = Math.abs(i - 20) > 8;
    hist += `<rect x="${(40 + i * bw).toFixed(1)}" y="${(H - h + 10).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" class="${off ? 'bad' : 'bar'}"><title>×${Math.pow(2, (i - 20) / 8).toFixed(2)}: ${c}</title></rect>`;
  });
  for (const k of [0.25, 0.5, 1, 2, 4]) {
    const i = Math.log2(k) * 8 + 20;
    hist += `<text x="${(40 + i * bw + bw / 2).toFixed(1)}" y="${H + 30}" class="tick">×${k}</text>`;
  }
  hist += '</svg>';

  // 3. log–log: ціна за кг від розміру для найбільшої групи
  const [g0, list0] = top[0];
  const pts = list0.filter((r) => r.qty && !r.weighted);
  const res = logLogResiduals(rows);
  const resFlag = clean.get('loglog-residual')!;
  const xs = pts.map((r) => Math.log10(r.qty! / r.pack));
  const ys = pts.map((r) => Math.log10(r.unit!));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (v: number) => 50 + ((v - x0) / (x1 - x0 || 1)) * (W - 70);
  const sy = (v: number) => 10 + (1 - (v - y0) / (y1 - y0 || 1)) * 300;
  let scatter = `<svg viewBox="0 0 ${W} 340" role="img">`;
  pts.forEach((r, i) => {
    const bad = resFlag.has(r.id);
    scatter += `<circle cx="${sx(xs[i]).toFixed(1)}" cy="${sy(ys[i]).toFixed(1)}" r="${bad ? 3.5 : 2}" class="${bad ? 'bad' : 'dot'}"><title>${esc(`[${r.chain}] ${r.name}: ${r.qty} → ${r.unit}/од., залишок ${res.get(r.id)?.toFixed(2)}`)}</title></circle>`;
  });
  scatter += `<text x="50" y="335" class="tick">log розміру (г / мл / шт) →</text></svg>`;

  const plantNames = [...recall.keys()];
  const recallTable = `<table><tr><th>Детектор</th>${plantNames.map((p) => `<th>${esc(p)}</th>`).join('')}<th>Тривог на чистих</th></tr>${DETECTORS.map(
    (d) =>
      `<tr><td><b>${d.name}</b><br><small>${esc(d.chart)}</small></td>${plantNames.map((p) => `<td>${recall.get(p)!.get(d.name)}</td>`).join('')}<td>${clean.get(d.name)!.size}</td></tr>`,
  ).join('')}</table>`;
  const qualityTable = `<table><tr><th>Мережа</th><th>Карток</th>${Object.keys(
    quality[0].missing,
  )
    .map((k) => `<th>без ${esc(k)}, %</th>`)
    .join('')}</tr>${quality
    .map(
      (t) =>
        `<tr><td>${t.chain}</td><td>${t.n}</td>${Object.values(t.missing)
          .map((v) => `<td style="--v:${v}" class="heat">${v}</td>`)
          .join('')}</tr>`,
    )
    .join('')}</table>`;
  const topFlags = rows
    .filter((r) => flagged.has(r.id))
    .slice(0, 40)
    .map(
      (r) =>
        `<li>[${r.chain}] ${esc(r.name)} — ${r.unit} за од. (${esc(unitGroup(r)!)})</li>`,
    )
    .join('');

  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Якість даних</title><style>
:root{--bg:#fff;--fg:#1d2433;--muted:#6b7280;--dot:#94a3b8;--bad:#dc2626;--bar:#64748b;--line:#e5e7eb}
@media (prefers-color-scheme:dark){:root{--bg:#111418;--fg:#e5e7eb;--muted:#9ca3af;--dot:#64748b;--bad:#f87171;--bar:#94a3b8;--line:#2a2f37}}
body{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif;max-width:960px;margin:0 auto;padding:16px}
svg{width:100%;height:auto}.dot{fill:var(--dot);opacity:.55}.bad{fill:var(--bad)}.bar{fill:var(--bar)}
.grid{stroke:var(--line)}.tick,.label{fill:var(--muted);font-size:11px}.label{text-anchor:end}.tick{text-anchor:middle}
table{border-collapse:collapse;width:100%;font-size:13px;display:block;overflow-x:auto}td,th{border-bottom:1px solid var(--line);padding:4px 8px;text-align:left}
.heat{background:color-mix(in oklch,var(--bad) calc(var(--v)*1%),transparent)}small{color:var(--muted)}
</style></head><body>
<h1>Якість даних: які графіки показують хибні дані (PRD-32, крок 1)</h1>
<p>Карток: ${rows.length}. Червоне — точки за межею |z| &gt; ${OUTLIER_RULES.limit} (медіана й MAD у групі).</p>
<h2>Частка знайдених підкинутих помилок</h2>${recallTable}
<h2>1. Ціна за кг / л / шт, логарифмічна шкала, по групах</h2>${strip}
<details><summary>Перші 40 позначених справжніх карток</summary><ul>${topFlags}</ul></details>
<h2>2. Ціна картки ÷ медіана ціни фасування (лог. шкала кількостей)</h2><p><small>Червоне — далі ніж ×2: інше фасування в одному товарі або хибне зіставлення.</small></p>${hist}
<h2>3. Ціна за одиницю від розміру, log–log: ${esc(g0)}</h2>${scatter}
<h2>4. Картки без ознаки, по мережах</h2>${qualityTable}
<h2>5. Стрибки ціни &gt; ×3 в історії: ${jumps.length}</h2><ul>${jumps
    .slice(0, 15)
    .map((j) => `<li>[${j.chain}] ${esc(j.name)}: ${j.prev} → ${j.price}</li>`)
    .join('')}</ul>
<h2>6. Фасування з кількома активними картками однієї мережі: ${merged.length}</h2><ul>${merged
    .slice(0, 15)
    .map(
      (m) =>
        `<li>${esc(m.product)} [${m.chain}] ×${m.n}: ${esc(m.names.slice(0, 3).join(' | '))}</li>`,
    )
    .join('')}</ul>
</body></html>`;
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0) / 4294967296;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

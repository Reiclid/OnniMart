// PRD-27: картки без штрихкоду (ALDI, VARUS…) → товари Open Food Facts тієї самої країни.
//
// Оцінка (за замовчуванням, лише читає). Еталон — картки зі штрихкодом: приховуємо його,
// шукаємо товар OFF за назвою й фасуванням і порівнюємо:
//   precision — частка правильних GTIN серед приписаних карткам, чий GTIN є в OFF (хибний GTIN
//               гірший за жоден: ціль ≥ 0,95); «усі» — разом з картками, яких в OFF немає;
//   recall    — частка знайдених серед карток, чий GTIN є в OFF.
// --write: GTIN однозначного збігу (з дублікатами OFF — усі) → barcodes фасувань без штрихкодів
// мереж (source 'openfoodfacts-match'). Фасування може мати кілька штрихкодів.
// Сумнівні збіги → barcode_candidates, їх вирішує модератор (/admin/barcodes).
// Склад і Nutri-Score для них підтягне наступний food:import.
//   bun run off:match                       # CSV з static.openfoodfacts.org (≈ 1,5 ГБ потоком)
//   bun run off:match -- off.csv.gz --write # з локального файлу, із записом
//   bun run off:match -- off.csv.gz --errors # хибні GTIN еталону
import { createInterface } from 'node:readline';
import {
  normalizeGtin,
  OffIndex,
  offDecision,
  parseQuantity,
  prepareListings,
  buildIdf,
  THRESHOLDS,
  type Idf,
  type ListingInput,
  type OffCandidate,
} from '@repo/matching';
import { PrismaService } from '../src/prisma/prisma.service';
import { columnIndex } from '../src/modules/catalog/food-facts';
import { CHAINS } from '../prisma/data/chains';
import { source } from './import-food-facts';

const AUTO_LEVELS = [0.8, 0.85, 0.9, 0.95];
const SOURCE = 'openfoodfacts-match';

const pct = (n: number) => `${(n * 100).toFixed(1)} %`;
const tags = (v: string | undefined) =>
  v ? v.split(',').map((t) => t.trim()) : [];

async function main() {
  const write = process.argv.includes('--write');
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const prisma = new PrismaService();

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
      variantId: true,
      delistedAt: true,
      chain: { select: { countryCode: true, slug: true } },
    },
  });
  // Мережі лише з акціями (Kaufland, PENNY, NORMA): одна пропозиція — ціла лінійка
  // («Birkel Nudeln», «Adventskalender»), тож один GTIN їй приписувати не можна
  const offersOnly = new Set(
    CHAINS.filter((c) => c.scrapeHourUtc !== undefined).map((c) => c.slug),
  );
  const listings = rows.filter((r) => !offersOnly.has(r.chain.slug));
  const { inputs, vocabulary } = prepareListings(
    rows.map((r) => ({
      ...r,
      country: r.chain.countryCode,
      netQuantity: r.netQuantity === null ? null : Number(r.netQuantity),
    })),
    // Обʼєднані бренди (/admin/brands), як у воркері
    new Map(
      (
        await prisma.brandAlias.findMany({
          select: { alias: true, brand: { select: { slug: true } } },
        })
      ).map((a) => [a.alias, a.brand.slug]),
    ),
  );

  // countries_tags OFF: "en:germany" → DE, лише країни наших карток
  const english = new Intl.DisplayNames(['en'], { type: 'region' });
  const countryOf = new Map(
    [...new Set(rows.map((r) => r.chain.countryCode))].map((code) => [
      `en:${(english.of(code) ?? code).toLowerCase().replace(/ /g, '-')}`,
      code,
    ]),
  );

  const index = new OffIndex();
  const started = Date.now();
  const lines = createInterface({
    input: await source(file),
    crlfDelay: Infinity,
  });
  let columns: Map<string, number> | null = null;
  for await (const line of lines) {
    if (!columns) {
      columns = columnIndex(line);
      continue;
    }
    const cells = line.split('\t');
    const get = (name: string) => cells[columns!.get(name) ?? -1]?.trim();
    const countries = tags(get('countries_tags'))
      .map((t) => countryOf.get(t))
      .filter((c): c is string => !!c);
    const gtin = countries.length ? normalizeGtin(get('code') ?? '') : null;
    const name = get('product_name');
    if (!gtin || !name) continue;
    for (const country of countries) {
      index.add({
        gtin,
        country,
        name,
        brands: tags(get('brands')).filter(Boolean),
        quantity: parseQuantity(get('quantity') ?? ''),
        imageUrl: get('image_small_url') || get('image_url') || null,
      });
    }
  }
  console.log(
    `OFF: ${index.size} товарів з фасуванням у країнах ${[...countryOf.values()].join(', ')} за ${Math.round((Date.now() - started) / 1000)} с`,
  );

  // Слова карток — у словник складених слів індексу; IDF — за злитими словами карток і OFF
  for (const [country, docs] of vocabulary) index.addWords(country, docs);
  const idfs = new Map<string, Idf>();
  const idf = (country: string) => {
    let value = idfs.get(country);
    if (!value) {
      value = buildIdf(index.vocabulary.get(country) ?? []);
      idfs.set(country, value);
    }
    return value;
  };
  const scored = new Map<string, OffCandidate[]>();
  const candidatesOf = (l: ListingInput) => {
    let value = scored.get(l.id);
    if (!value) scored.set(l.id, (value = index.candidates(l, idf(l.country))));
    return value;
  };

  const errors = evaluate(
    listings.filter((r) => r.barcodes.length).map((r) => inputs.get(r.id)!),
    index,
    candidatesOf,
  );
  if (process.argv.includes('--errors')) {
    const names = new Map(rows.map((r) => [r.id, r.rawName]));
    console.log(`
Хибні GTIN за порогу ${THRESHOLDS.auto} (картка → приписаний | правильний):`);
    for (const { listing, gtin } of errors) {
      const truth = listing.barcodes.map((g) => index.labelOf(g)).find(Boolean);
      console.log(
        `  ${names.get(listing.id)}  →  ${index.labelOf(gtin)}  |  ${truth ?? '— немає в OFF'}`,
      );
    }
  }

  if (process.argv.includes('--misses'))
    reportMisses(
      listings.filter((r) => r.barcodes.length).map((r) => inputs.get(r.id)!),
      index,
      candidatesOf,
      new Map(rows.map((r) => [r.id, r.rawName])),
    );

  // Картки без штрихкоду: рішення за поточними порогами, групою по фасуванню
  // Штрихкоди з мереж — уже відомий товар; власні попередні збіги не заважають дописати дублікати
  const variantBarcodes = new Set(
    (
      await prisma.barcode.findMany({
        where: { NOT: { source: SOURCE } },
        select: { variantId: true },
      })
    ).map((b) => b.variantId),
  );
  /** Фасування → набори GTIN, які дали його картки (рядок — відсортовані GTIN) */
  const byVariant = new Map<string, Set<string>>();
  /** Фасування → сумнівні кандидати OFF (найкраща схожість серед його карток) */
  const toReview = new Map<string, Map<string, number>>();
  const counts = { match: 0, review: 0, none: 0 };
  const examples: string[] = [];
  for (const row of listings) {
    if (row.barcodes.length || row.delistedAt || !row.variantId) continue;
    if (variantBarcodes.has(row.variantId)) continue;
    const decision = offDecision(candidatesOf(inputs.get(row.id)!), THRESHOLDS);
    counts[decision.kind]++;
    if (decision.kind === 'review') {
      const best = toReview.get(row.variantId) ?? new Map<string, number>();
      for (const c of decision.candidates)
        best.set(c.gtin, Math.max(best.get(c.gtin) ?? 0, c.score));
      toReview.set(row.variantId, best);
    }
    if (decision.kind !== 'match') continue;
    const gtins = byVariant.get(row.variantId) ?? new Set();
    gtins.add(decision.gtins.join(','));
    byVariant.set(row.variantId, gtins);
    if (examples.length < 15)
      examples.push(
        `  ${row.rawName}  →  ${decision.gtins.join(', ')} (${decision.score})`,
      );
  }
  // Картки одного фасування вказали на різні товари OFF — не вгадуємо
  const confident = [...byVariant].filter(([, g]) => g.size === 1);
  console.log(
    `\nКартки без штрихкоду: збіг ${counts.match}, на перевірку ${counts.review}, без кандидата ${counts.none}; ` +
      `фасувань з однозначним GTIN: ${confident.length} (суперечливих ${byVariant.size - confident.length})`,
  );
  console.log(examples.join('\n'));

  if (write) {
    const taken = new Set(
      (await prisma.barcode.findMany({ select: { gtin: true } })).map(
        (b) => b.gtin,
      ),
    );
    const data = confident
      .flatMap(([variantId, g]) =>
        [...g][0]
          .split(',')
          .map((gtin) => ({ gtin, variantId, source: SOURCE })),
      )
      // GTIN уже має інше фасування — це питання до модератора, а не до цього скрипта
      .filter((b) => !taken.has(b.gtin));
    const { count } = await prisma.barcode.createMany({
      data,
      skipDuplicates: true,
    });
    console.log(`\nЗаписано штрихкодів: ${count}. Далі: bun run food:import`);

    // Сумнівні — модераторові (/admin/barcodes); фасування з однозначним збігом туди не йдуть.
    // Уже розглянуті пари (unique variantId + gtin) не перезаписуються
    const matched = new Set(confident.map(([variantId]) => variantId));
    const review = await prisma.barcodeCandidate.createMany({
      data: [...toReview]
        .filter(([variantId]) => !matched.has(variantId))
        .flatMap(([variantId, best]) =>
          [...best]
            .filter(([gtin]) => !taken.has(gtin))
            .map(([gtin, score]) => ({
              variantId,
              gtin,
              score,
              offName: index.labelOf(gtin) ?? gtin,
              imageUrl: index.imageOf(gtin),
            })),
        ),
      skipDuplicates: true,
    });
    console.log(`На модерацію штрихкодів: ${review.count}`);

    // Кандидатам, записаним раніше без фото, — фото з поточного вивантаження
    const missing = await prisma.barcodeCandidate.findMany({
      where: { imageUrl: null },
      select: { id: true, gtin: true },
    });
    let photos = 0;
    for (const { id, gtin } of missing) {
      const imageUrl = index.imageOf(gtin);
      if (!imageUrl) continue;
      await prisma.barcodeCandidate.update({
        where: { id },
        data: { imageUrl },
      });
      photos++;
    }
    console.log(`Дописано фото кандидатам: ${photos} з ${missing.length}`);
  }
  await prisma.$disconnect();
}

/** Чому картки, чий GTIN є в OFF своєї країни, не отримали збігу: причини з прикладами (--misses) */
function reportMisses(
  evaluated: ListingInput[],
  index: OffIndex,
  candidatesOf: (l: ListingInput) => OffCandidate[],
  names: Map<string, string>,
) {
  const reasons = new Map<string, string[]>();
  const add = (reason: string, line: string) =>
    reasons.set(reason, [...(reasons.get(reason) ?? []), line]);
  for (const l of evaluated) {
    const truth = l.barcodes.find((g) => index.hasIn(l.country, g));
    if (!truth) continue;
    const d = offDecision(candidatesOf(l), THRESHOLDS);
    if (d.kind === 'match' && d.gtins.some((g) => l.barcodes.includes(g)))
      continue;
    const cands = candidatesOf(l);
    const hit = cands.find((c) => l.barcodes.includes(c.gtin));
    const best = cands[0];
    let reason: string;
    if (d.kind === 'match') reason = 'хибний збіг';
    else if (!l.features.brand) reason = 'картка без бренду';
    else if (!hit) reason = 'правильного немає серед кандидатів';
    else if (hit.score < THRESHOLDS.review) reason = 'схожість < review';
    else if (hit.score < THRESHOLDS.auto) reason = 'review ≤ схожість < auto';
    else reason = 'схожість ≥ auto, але є рівний/кращий інший';
    add(
      reason,
      `  ${names.get(l.id)} [${l.features.brand}]  |  OFF: ${index.labelOf(truth)}  |  правильний ${hit?.score.toFixed(2) ?? '—'}, найкращий ${best ? `${best.score.toFixed(2)} ${index.labelOf(best.gtin)}` : '—'}`,
    );
  }
  for (const [reason, lines] of [...reasons].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.log(`\n## ${reason}: ${lines.length}`);
    // Вибірка з кроком, щоб побачити різні випадки, а не початок списку
    const step = Math.max(1, Math.floor(lines.length / 25));
    for (let i = 0; i < lines.length; i += step) console.log(lines[i]);
  }
}

/** Еталон — картки зі штрихкодом; той самий алгоритм, штрихкод схований */
function evaluate(
  evaluated: ListingInput[],
  index: OffIndex,
  candidatesOf: (l: ListingInput) => OffCandidate[],
): { listing: ListingInput; gtin: string }[] {
  const errors: { listing: ListingInput; gtin: string }[] = [];
  const own = (l: ListingInput) =>
    l.barcodes.some((g) => index.hasIn(l.country, g));
  const inOff = evaluated.filter(own);
  // GTIN лише в OFF іншої країни: між країнами не зіставляємо, тож у знаменник не йде
  const foreign = evaluated.filter(
    (l) => !own(l) && l.barcodes.some((g) => index.has(g)),
  );
  console.log(
    `\nКарток зі штрихкодом: ${evaluated.length}, з них GTIN є в OFF своєї країни: ${inOff.length}, лише в OFF іншої країни: ${foreign.length}`,
  );
  // Precision — на картках, чий GTIN є в OFF: лише там правильну відповідь видно.
  // Поза OFF приписаний GTIN — або інший штрихкод того самого товару, або помилка: їх лише рахуємо
  console.log(
    '| Поріг авто | Приписано | Правильних | Precision (усі) | Precision (GTIN в OFF) | Recall | F1 | Поза OFF | На перевірку |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const auto of AUTO_LEVELS) {
    let matched = 0;
    let decidable = 0;
    let correct = 0;
    let review = 0;
    for (const l of evaluated) {
      const d = offDecision(candidatesOf(l), { ...THRESHOLDS, auto });
      if (d.kind === 'review') review++;
      if (d.kind !== 'match') continue;
      matched++;
      if (own(l)) decidable++;
      if (d.gtins.some((g) => l.barcodes.includes(g))) correct++;
      else if (auto === THRESHOLDS.auto)
        errors.push({ listing: l, gtin: d.gtins[0] });
    }
    const precision = decidable ? correct / decidable : 0;
    const recall = inOff.length ? correct / inOff.length : 0;
    const f1 =
      precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    console.log(
      `| ${auto.toFixed(2)} | ${matched} | ${correct} | ${pct(matched ? correct / matched : 0)} | ${pct(precision)} | ${pct(recall)} | ${f1.toFixed(3)} | ${matched - decidable} | ${review} |`,
    );
  }
  return errors;
}

void main();

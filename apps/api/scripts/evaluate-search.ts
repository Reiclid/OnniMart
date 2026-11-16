// Офлайн-оцінка пошуку каталогу — як match:evaluate для матчингу. Запити uk/de/en у країнах
// UA і DE; релевантність — за назвою товару (регулярні вирази нижче, незалежні від conceptOf),
// тож оцінка не повторює логіку пошуку. P@10 і P@50 — частка релевантних серед перших
// 10 / 50 (або всіх, якщо знайдено менше), «порожні» — запити без жодного результату,
// «повнота» — частка релевантних, знайдених і простим текстовим пошуком Meilisearch.
// Лише читає БД і Meilisearch.
//   bun run search:evaluate
//   bun run search:evaluate -- --sql        (SQL-запасний шлях, без Meilisearch)
//   bun run search:evaluate -- --legacy     (без розбору запиту: ціна й нагода як слова)
//   bun run search:evaluate -- --verbose    (перші 10 назв кожного запиту)
import 'dotenv/config';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { queryConcept } from '@repo/matching';
import {
  meili,
  PRODUCTS_INDEX,
  searchEnabled,
  searchFilter,
  searchProductIds,
} from '../src/modules/catalog/search/search';
import { PrismaService } from '../src/prisma/prisma.service';

const L = '(?<!\\p{L})';
const END = '(?!\\p{L})';

/** Що вважається цим товаром: назва відповідає `is` і не відповідає `not` */
const RELEVANT: Record<string, { is: string; not?: string }> = {
  milk: {
    is: `${L}молоко|milch|${L}milk${END}`,
    not: 'згущ|kondens|шоколад|schoko|schnitte|mäuse|maus|bonbon|морозив|eis|печив|keks|kaffee|кава|reis|creme|brötchen|riegel|цукерк',
  },
  bread: {
    is: `${L}хліб(?!ц)|brot(?!chen|aufstrich)|${L}bread`,
    not: 'knäcke|magenbrot|lebkuchen|сухар',
  },
  kefir: { is: 'кефір|kefir' },
  yogurt: { is: '[йи]огурт|jog?h?urt|yog' },
  'sour-cream': { is: 'сметан|schmand|sauerrahm|saure sahne' },
  butter: {
    is: `${L}масло|butter`,
    not: 'соняш|олив|арахіс|печив|keks|milch|croissant|brezel|кекс|gebäck',
  },
  eggs: {
    is: `${L}яйц[еяі]|${L}eier${END}|freiland|bodenhaltung`,
    not: 'nudel|likör|шоколад|schoko',
  },
  cheese: {
    is: `${L}сир${END}|${L}сир |käse|kase|quark`,
    not: 'сирок|kuchen|cracker|крекер|чипс',
  },
  coffee: {
    is: `${L}кава|kaffee|coffee`,
    not: 'цукерк|schok|шоколад|sahne|weißer',
  },
  tea: { is: `${L}чай|tee${END}`, not: 'eistee' },
  water: { is: `${L}вода|wasser`, not: 'melone|туалет' },
  juice: { is: `${L}сік|${L}нектар|saft|nektar|smoothie`, not: 'ziegel' },
  beer: { is: `${L}пиво|bier|pils`, not: 'schinken|wurst|чипс' },
  wine: { is: `${L}вино|wein`, not: 'brand|essig|gummi|trauben|оцет' },
  chocolate: {
    is: 'шоколад|schokolade',
    not: 'печив|вафл|keks|kuchen|цукерк|кекс|паст|creme|milch-drink|морозив',
  },
  cookies: { is: 'печив|keks|cookie' },
  chips: { is: 'чипс|chips' },
  sausage: { is: `ковбас|${L}wurst|salami`, not: 'сосиск|würstchen' },
  chicken: {
    is: 'кур[ячк]|курин|hähnchen|huhn|hühn|chicken',
    not: 'бульйон|чипс|суп|корм',
  },
  bananas: {
    is: 'банан|banane',
    not: 'йогурт|chips|сік|нектар|pudding|морозив|пюре|шоколад|batonch|батончик',
  },
  apples: {
    is: `${L}яблук|äpfel|apfel`,
    not: 'сік|нектар|пюре|чипс|saft|mus|schorle|essig|chips|пиріг|kuchen',
  },
  potatoes: {
    is: 'картопл|kartoffel',
    not: 'чипс|chips|пюре|püree|salat|крохмал|stärke',
  },
  buckwheat: { is: 'гречк|гречан|buchweizen', not: 'хлібц|мед' },
  rice: {
    is: `${L}рис${END}|${L}reis${END}|basmati|jasmin`,
    not: 'waffel|хлібц|milchreis|напій|drink',
  },
  pasta: { is: 'макарон|спагет|вермішел|nudeln|spaghetti|penne|fusilli|pasta' },
  oil: {
    is: `${L}олія|öl${END}`,
    not: 'sardin|thunfisch|tuna|шпрот|сардин|тунець',
  },
  sugar: {
    is: `${L}цукор|zucker`,
    not: 'без цукру|ohne zucker|zuckerfrei|печив|цукерк',
  },
  flour: { is: 'борошно|mehl', not: 'speise' },
  'ice-cream': {
    is: `морозиво|${L}eis${END}|eiscreme|${L}eis-|sorbet`,
    not: 'eistee|eisberg',
  },
  // Непродуктові (PRD-19): релевантність — за назвою, незалежно від conceptOf
  laundry: {
    is: 'пральн|для прання|waschmittel|waschpulver|waschgel|laundry|persil|ariel',
    not: 'посуд|spül|spul|wäscheständer',
  },
  dishwashing: {
    is: 'для миття посуду|для посуду|spülmittel|geschirrspülmittel|handspül|dish',
    not: 'посудомийн|maschin',
  },
  'toilet-paper': { is: 'туалетн\\p{L}* папір|toilettenpapier|klopapier' },
  shampoo: {
    is: `${L}шампун|shampoo`,
    not: 'для собак|для котів|hund|katze|dog|cat|pet',
  },
  toothpaste: { is: 'зубна паста|паста зубна|zahnpasta|zahncreme|toothpaste' },
  deodorant: {
    is: `дезодорант|антиперспірант|${L}deo${END}|deodorant|transpirant`,
  },
  diapers: { is: 'підгузк|підгузник|windel|diaper|pampers' },
  'cat-food': {
    is: '^(?=.*(?:корм|futter|food|ласощі|snack|leckerli))(?=.*(?:кот|кіш|katze|cat))',
    not: 'наповнювач|streu|litter|іграшка|spielzeug',
  },
  'dog-food': {
    is: '^(?=.*(?:корм|futter|food|ласощі|snack|leckerli))(?=.*(?:собак|цуценят|hund|dog))',
    not: 'наповнювач|іграшка|spielzeug|shampoo|шампунь',
  },
  'cat-litter': { is: 'наповнювач|katzenstreu|streu|litter|katzentoilette' },
  soap: { is: `${L}мило|крем-мило|seife`, not: 'олівець' },
  wipes: {
    is: 'серветки вологі|вологі серветки|feuchttücher|feuchte tücher|wet wipes',
  },
  // Нагоди (PRD-21)
  'beer-snacks': {
    is: 'чипс|chips|горіх|горішк|арахіс|nuss|nüsse|nuts|peanut|крекер|cracker|сухарик|сир|käse|cheese|снек|snack|попкорн|popcorn|brezel|pretzel',
    not: 'шоколад|schoko|pudding|йогурт|joghurt|морозив|eis|milchschnitte',
  },
  breakfast: {
    is: 'вівсян|haferflocken|müsli|мюслі|йогурт|joghurt|хліб|brot|brötchen|яйц|eier|молоко|milch|масло|butter|сир|käse|кава|kaffee|чай|tee|булочк|круасан|croissant|пластівці|cereal|oat',
    not: 'шоколад|schoko|морозив|eis|бульйон|суп',
  },
  'tea-snacks': {
    is: 'печив|keks|cookie|biscuit|торт|kuchen|кекс|muffin|вафл|waffel|цукерк|bonbon|пряник|lebkuchen|шоколад|schokolade|cake',
    not: 'корм|futter',
  },
  'shower-gel': { is: 'гель для душу|гель-душ|duschgel|dusche|shower' },
};

/** Запит, країна і що має знайтись (+ додаткова умова на назву для запитів із брендом / видом) */
const QUERIES: {
  q: string;
  country: string;
  want: string;
  also?: string;
  group?: 'non-food' | 'intent';
  /** Запит з ціною (PRD-21): релевантний товар ще й коштує не більше */
  maxPrice?: number;
  currency?: 'UAH' | 'EUR';
}[] = [
  ...[
    ['молоко', 'milk'],
    ['milk', 'milk'],
    ['milch', 'milk'],
    ['хліб', 'bread'],
    ['bread', 'bread'],
    ['кефір', 'kefir'],
    ['йогурт', 'yogurt'],
    ['сметана', 'sour-cream'],
    ['масло вершкове', 'butter'],
    ['яйця', 'eggs'],
    ['сир', 'cheese'],
    ['кава', 'coffee'],
    ['coffee', 'coffee'],
    ['чай', 'tea'],
    ['вода', 'water'],
    ['сік', 'juice'],
    ['пиво', 'beer'],
    ['вино', 'wine'],
    ['шоколад', 'chocolate'],
    ['печиво', 'cookies'],
    ['чипси', 'chips'],
    ['ковбаса', 'sausage'],
    ['курятина', 'chicken'],
    ['банани', 'bananas'],
    ['яблука', 'apples'],
    ['картопля', 'potatoes'],
    ['гречка', 'buckwheat'],
    ['рис', 'rice'],
    ['макарони', 'pasta'],
    ['олія', 'oil'],
    ['цукор', 'sugar'],
    ['борошно', 'flour'],
    ['морозиво', 'ice-cream'],
  ].map(([q, want]) => ({ q, want, country: 'UA' })),
  { q: 'молоко галичина', country: 'UA', want: 'milk', also: 'галичин' },
  { q: 'хліб житній', country: 'UA', want: 'bread', also: 'житн' },
  { q: 'кава мелена', country: 'UA', want: 'coffee', also: 'мелен' },
  ...[
    ['молоко', 'milk'],
    ['milch', 'milk'],
    ['milk', 'milk'],
    ['хліб', 'bread'],
    ['brot', 'bread'],
    ['bread', 'bread'],
    ['butter', 'butter'],
    ['масло вершкове', 'butter'],
    ['käse', 'cheese'],
    ['сир', 'cheese'],
    ['eier', 'eggs'],
    ['яйця', 'eggs'],
    ['kaffee', 'coffee'],
    ['кава', 'coffee'],
    ['bier', 'beer'],
    ['пиво', 'beer'],
    ['schokolade', 'chocolate'],
    ['шоколад', 'chocolate'],
    ['wurst', 'sausage'],
    ['bananen', 'bananas'],
    ['банани', 'bananas'],
    ['nudeln', 'pasta'],
    ['макарони', 'pasta'],
    ['reis', 'rice'],
    ['joghurt', 'yogurt'],
    ['йогурт', 'yogurt'],
    ['wasser', 'water'],
    ['вода', 'water'],
    ['saft', 'juice'],
    ['kartoffeln', 'potatoes'],
  ].map(([q, want]) => ({ q, want, country: 'DE' })),
  // Непродуктові запити (PRD-19): окрема група у підсумку
  ...[
    ['пральний порошок', 'laundry'],
    ['засіб для миття посуду', 'dishwashing'],
    ['туалетний папір', 'toilet-paper'],
    ['шампунь', 'shampoo'],
    ['зубна паста', 'toothpaste'],
    ['дезодорант', 'deodorant'],
    ['підгузки', 'diapers'],
    ['корм для котів', 'cat-food'],
    ['корм для собак', 'dog-food'],
    ['наповнювач для котів', 'cat-litter'],
    ['мило', 'soap'],
    ['вологі серветки', 'wipes'],
    ['гель для душу', 'shower-gel'],
  ].map(([q, want]) => ({ q, want, country: 'UA', group: 'non-food' })),
  ...[
    ['waschmittel', 'laundry'],
    ['spülmittel', 'dishwashing'],
    ['toilettenpapier', 'toilet-paper'],
    ['shampoo', 'shampoo'],
    ['zahnpasta', 'toothpaste'],
    ['deo', 'deodorant'],
    ['windeln', 'diapers'],
    ['katzenfutter', 'cat-food'],
    ['hundefutter', 'dog-food'],
    ['seife', 'soap'],
    ['feuchttücher', 'wipes'],
    ['duschgel', 'shower-gel'],
  ].map(([q, want]) => ({ q, want, country: 'DE', group: 'non-food' })),
  // Запити з ціною й нагодою (PRD-21): релевантний товар ще й коштує не більше межі
  ...(
    [
      ['молоко до 40 грн', 'milk', 'UA', 40, 'UAH'],
      ['хліб до 30 грн', 'bread', 'UA', 30, 'UAH'],
      ['сир до 100 гривень', 'cheese', 'UA', 100, 'UAH'],
      ['кава до 150 грн', 'coffee', 'UA', 150, 'UAH'],
      ['пиво до 40 грн', 'beer', 'UA', 40, 'UAH'],
      ['шоколад дешевше 50 грн', 'chocolate', 'UA', 50, 'UAH'],
      ['milch unter 1 €', 'milk', 'DE', 1, 'EUR'],
      ['brot unter 2 €', 'bread', 'DE', 2, 'EUR'],
      ['käse unter 3 €', 'cheese', 'DE', 3, 'EUR'],
      ['milk under 1 euro', 'milk', 'DE', 1, 'EUR'],
      ['до пива', 'beer-snacks', 'UA'],
      ['закуски до пива до 60 грн', 'beer-snacks', 'UA', 60, 'UAH'],
      ['на сніданок', 'breakfast', 'UA'],
      ['до чаю', 'tea-snacks', 'UA'],
      ['zum Bier', 'beer-snacks', 'DE'],
      ['zum Frühstück', 'breakfast', 'DE'],
      ['for breakfast', 'breakfast', 'DE'],
    ] as [string, string, string, number?, ('UAH' | 'EUR')?][]
  ).map(([q, want, country, maxPrice, currency]) => ({
    q,
    want,
    country,
    maxPrice,
    currency,
    group: 'intent' as const,
  })),
  // Запит однією мовою, країна з іншою — це і є різниця від простого тексту
  ...[
    ['windeln', 'diapers'],
    ['katzenfutter', 'cat-food'],
    ['zahnpasta', 'toothpaste'],
    ['waschmittel', 'laundry'],
    ['seife', 'soap'],
    ['shampoo', 'shampoo'],
  ].map(([q, want]) => ({ q, want, country: 'UA', group: 'non-food' })),
  ...[
    ['підгузки', 'diapers'],
    ['корм для котів', 'cat-food'],
    ['зубна паста', 'toothpaste'],
    ['пральний порошок', 'laundry'],
    ['мило', 'soap'],
    ['шампунь', 'shampoo'],
  ].map(([q, want]) => ({ q, want, country: 'DE', group: 'non-food' })),
];

/** Скільки перших результатів оцінюється для повноти */
const POOL = 300;

const has = (flag: string) => process.argv.includes(`--${flag}`);

/** Пошук, як було до розбору запиту: увесь текст, поняття цілого запиту, країна — порядок */
async function legacySearch(q: string, country: string) {
  return searchProductIds(
    q,
    [],
    0,
    POOL,
    undefined,
    queryConcept(q),
    searchFilter({ country })[0],
  );
}

/** Найнижча ціна товарів у валюті запиту (з індексу) */
async function priceOf(ids: string[], currency: 'UAH' | 'EUR' = 'UAH') {
  const field = currency === 'EUR' ? 'priceEur' : 'priceUah';
  const { results } = await meili<{
    results: ({ id: string } & Record<string, number | null | string>)[];
  }>(`/indexes/${PRODUCTS_INDEX}/documents/fetch`, {
    method: 'POST',
    body: JSON.stringify({
      filter: [`id IN ${JSON.stringify(ids)}`],
      fields: ['id', field],
      limit: ids.length,
    }),
  });
  return new Map(
    results.map((r) => [r.id, r[field] as number | null] as const),
  );
}

async function main() {
  if (has('sql')) delete process.env.MEILI_URL;
  const prisma = new PrismaService();
  // findProductIds користується лише БД і Meilisearch
  const catalog = new CatalogService(prisma, null as never, null as never);
  const rows: {
    q: string;
    country: string;
    total: number;
    p10: number;
    p50: number;
    recall: number | null;
    group?: 'non-food' | 'intent';
  }[] = [];
  try {
    for (const {
      q,
      country,
      want,
      also,
      group,
      maxPrice,
      currency,
    } of QUERIES) {
      // --legacy: пошук без розбору запиту (як до PRD-21) — для порівняння
      const { ids, total } = has('legacy')
        ? await legacySearch(q, country)
        : await catalog.findProductIds({ q, country }, 0, POOL);
      const prices = maxPrice
        ? await priceOf(ids.slice(0, 50), currency)
        : null;
      // Повнота: релевантні з перших POOL проти релевантних у них і в простому текстовому
      // пошуку (без поняття) — чи фільтр поняття не губить товари без поняття
      const text =
        searchEnabled() && group !== 'intent'
          ? (await searchProductIds(q, searchFilter({ country }), 0, POOL)).ids
          : [];
      const names = new Map(
        (
          await prisma.product.findMany({
            where: { id: { in: [...new Set([...ids, ...text])] } },
            select: { id: true, name: true },
          })
        ).map((p) => [p.id, p.name]),
      );
      const rule = RELEVANT[want];
      const is = new RegExp(rule.is, 'iu');
      const not = rule.not ? new RegExp(rule.not, 'iu') : null;
      const extra = also ? new RegExp(also, 'iu') : null;
      const relevant = (id: string) => {
        const name = names.get(id) ?? '';
        const price = prices?.get(id);
        return (
          is.test(name) &&
          !not?.test(name) &&
          (!extra || extra.test(name)) &&
          (!maxPrice || (price != null && price <= maxPrice))
        );
      };
      const ok = ids.map(relevant);
      const precision = (k: number) => {
        const top = ok.slice(0, k);
        return top.length ? top.filter(Boolean).length / top.length : 0;
      };
      const all = new Set([...ids, ...text].filter(relevant));
      rows.push({
        group,
        q,
        country,
        total,
        p10: precision(10),
        p50: precision(50),
        recall:
          text.length && all.size ? ok.filter(Boolean).length / all.size : null,
      });
      if (has('verbose')) {
        console.log(`
${country} «${q}» — ${total}`);
        ids
          .slice(0, 10)
          .forEach((id, i) =>
            console.log(`  ${ok[i] ? '+' : '-'} ${names.get(id)}`),
          );
        const missed = [...all].filter((id) => !ids.includes(id));
        if (missed.length)
          console.log(
            `  пропущено: ${missed
              .slice(0, 8)
              .map((id) => names.get(id))
              .join(' | ')}`,
          );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  const pct = (x: number) => `${(x * 100).toFixed(0)} %`.padStart(6);
  console.log('\nкраїна  запит                 знайдено   P@10   P@50 повнота');
  for (const r of rows)
    console.log(
      `${r.country.padEnd(7)} ${r.q.padEnd(21)} ${String(r.total).padStart(8)} ${pct(r.p10)} ${pct(r.p50)} ${r.recall === null ? '     —' : pct(r.recall)}`,
    );
  const summary = (label: string, part: typeof rows) => {
    const recalls = part.flatMap((r) => (r.recall === null ? [] : [r.recall]));
    const mean = (f: (r: (typeof rows)[number]) => number) =>
      part.reduce((s, r) => s + f(r), 0) / part.length;
    console.log(
      `${label}: запитів ${part.length} (${process.env.MEILI_URL ? 'Meilisearch' : 'SQL'}) · P@10 ${pct(mean((r) => r.p10)).trim()} · P@50 ${pct(mean((r) => r.p50)).trim()} · порожніх: ${part.filter((r) => r.total === 0).length}${recalls.length ? ` · повнота ${pct(recalls.reduce((a, b) => a + b, 0) / recalls.length).trim()}` : ''}`,
    );
  };
  console.log('');
  summary(
    'Продуктові',
    rows.filter((r) => !r.group),
  );
  summary(
    'Непродуктові',
    rows.filter((r) => r.group === 'non-food'),
  );
  summary(
    'Ціна й нагода',
    rows.filter((r) => r.group === 'intent'),
  );
  summary('Разом', rows);
}

void main();

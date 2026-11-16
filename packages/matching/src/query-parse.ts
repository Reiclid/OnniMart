import type { CategorySlug } from './categories';
import { queryConcept } from './concepts';

/**
 * Розбір вільного запиту покупця (PRD-21, етап 1): правила й словник, без моделі.
 * "дешеве молоко до 40 грн", "unter 2 € Käse", "що купити до пива" → структура, з якої
 * пошук робить фільтри: ціна, поняття, нагода. Чиста функція, без БД та мережі.
 *
 * Запит, який не схожий ні на що з цього ("молоко", "Моршинська"), лишається текстом:
 * `text` — те, що лишилось після вилучених фраз; пошук користується ним як раніше.
 */

export type Currency = 'UAH' | 'EUR';

export type Diet =
  | 'vegan'
  | 'vegetarian'
  | 'lactose-free'
  | 'gluten-free'
  | 'sugar-free';

export type Sort = 'price-asc';

/** Нагода — набір понять (слаг предка охоплює й нащадків: snacks → chips, nuts…) */
export const OCCASIONS = {
  beer: ['snacks', 'cheese'],
  wine: ['cheese', 'nuts', 'ham', 'crackers', 'chocolate'],
  tea: ['cookies', 'cake', 'muffin', 'wafers', 'candy', 'gingerbread', 'chocolate'],
  coffee: ['cookies', 'cake', 'croissant', 'muffin', 'wafers', 'chocolate'],
  breakfast: ['oats', 'yogurt', 'bread', 'rolls', 'eggs', 'milk', 'butter', 'cheese', 'cottage-cheese', 'coffee', 'tea'],
  lunch: ['pasta', 'rice', 'buckwheat', 'potatoes', 'chicken', 'pork', 'beef', 'vegetables'],
  dinner: ['meat', 'fish', 'potatoes', 'pasta', 'rice', 'vegetables'],
  barbecue: ['pork', 'chicken', 'beef', 'sausage', 'wieners', 'vegetables'],
  party: ['snacks', 'soda', 'juice', 'beer', 'wine', 'sparkling-wine', 'sweets'],
  picnic: ['sausage', 'bread', 'cheese', 'fruit', 'vegetables', 'water', 'juice'],
  dessert: ['ice-cream', 'cake', 'chocolate', 'yogurt', 'fruit', 'cookies'],
  movie: ['popcorn', 'chips', 'soda', 'candy'],
  sandwich: ['bread', 'ham', 'sausage', 'cheese', 'butter'],
  birthday: ['cake', 'sweets', 'soda', 'juice', 'ice-cream'],
} as const satisfies Record<string, readonly string[]>;

export type Occasion = keyof typeof OCCASIONS;

export interface ParsedQuery {
  /** Поняття (слаги CONCEPTS), названі словами запиту, у порядку появи */
  concepts: string[];
  /** Категорії, названі без поняття: "заморожені", "побутова хімія", "Tiefkühl" */
  categories: CategorySlug[];
  maxPrice?: number;
  minPrice?: number;
  /** Валюта ціни: ціна без валюти ("до 2 кг") не розбирається */
  currency?: Currency;
  occasion?: Occasion;
  diet?: Diet;
  sort?: Sort;
  /** Запит без вилучених фраз (ціна, нагода, категорія, "дешеве"); слова понять і дієти лишаються */
  text: string;
}

const L = '(?<![\\p{L}\\p{N}])';
const R = '(?![\\p{L}\\p{N}])';
const word = (pattern: string) => new RegExp(`${L}(?:${pattern})${R}`, 'gu');

const NUM = '(\\d+(?:[.,]\\d{1,2})?)';
const CUR =
  '(грн\\.?|гривн\\p{L}*|гривен\\p{L}*|грівн\\p{L}*|uah|₴|євро|евро|euros?|eur|€)';

const AT_MOST = [
  'до',
  'дешевше(?:\\s+за|\\s+ніж)?',
  'не\\s+дорожче(?:\\s+за|\\s+ніж)?',
  'менше(?:\\s+за|\\s+ніж)?',
  'не\\s+більше(?:\\s+за|\\s+ніж)?',
  'максимум',
  'макс\\.?',
  'unter',
  'bis(?:\\s+zu)?',
  'weniger\\s+als',
  'g(?:ü|u)nstiger\\s+als',
  'billiger\\s+als',
  'h(?:ö|o)chstens',
  'maximal',
  'max\\.?',
  'under',
  'below',
  'less\\s+than',
  'cheaper\\s+than',
  'up\\s+to',
  'at\\s+most',
  'not\\s+more\\s+than',
  'within',
].join('|');

const AT_LEAST = [
  'від',
  'дорожче(?:\\s+за|\\s+ніж)?',
  'не\\s+дешевше(?:\\s+за|\\s+ніж)?',
  'більше(?:\\s+за|\\s+ніж)?',
  'мінімум',
  'ab',
  'mindestens',
  'teurer\\s+als',
  'mehr\\s+als',
  'from',
  'over',
  'above',
  'more\\s+than',
  'at\\s+least',
].join('|');

const price = (limit: string) =>
  new RegExp(
    `${L}(?:${limit})\\s*(?:${CUR}\\s*)?${NUM}\\s*${CUR}?${R}`,
    'gu',
  );
const RANGE = new RegExp(
  `${L}(?:від|ab|from|between|zwischen)\\s*${NUM}\\s*${CUR}?\\s*(?:до|bis|to|and|und|-|–|—)\\s*${NUM}\\s*${CUR}?${R}`,
  'gu',
);
const MAX_PRICE = price(AT_MOST);
const MIN_PRICE = price(AT_LEAST);

const number = (text: string) => Number(text.replace(',', '.'));
const currencyOf = (symbol: string): Currency =>
  /^[гu₴]/u.test(symbol) ? 'UAH' : 'EUR';

/** "дешеве", "günstig", "cheapest": від дешевих до дорожчих */
const SORT_CHEAP = word(
  'дешев\\p{L}*|найдешевш\\p{L}*|недорог\\p{L}*|бюджетн\\p{L}*|billig\\p{L}*|g(?:ü|u)nstig\\p{L}*|am\\s+g(?:ü|u)nstigsten|preiswert\\p{L}*|cheap\\p{L}*|inexpensive|budget|lowest\\s+price',
);

const DIETS: [Diet, RegExp][] = [
  ['vegan', word('веган\\p{L}*|vegan\\p{L}*')],
  ['vegetarian', word('вегетаріан\\p{L}*|vegetari\\p{L}*')],
  ['lactose-free', word('безлактоз\\p{L}*|без\\s+лактози|lactose[\\s-]?free|laktose[\\s-]?frei\\p{L}*|ohne\\s+laktose')],
  ['gluten-free', word('безглютен\\p{L}*|без\\s+глютену|gluten[\\s-]?free|glutenfrei\\p{L}*|ohne\\s+gluten')],
  ['sugar-free', word('без\\s+цукр\\p{L}*|zuckerfrei\\p{L}*|ohne\\s+zucker|sugar[\\s-]?free|no\\s+sugar')],
];

/** Категорії, для яких немає власного поняття (поняття — "молоко", "напої", "алкоголь" — шукає пошук) */
const CATEGORY_WORDS: [CategorySlug, RegExp][] = [
  ['frozen', new RegExp(`${L}(?:заморожен\\p{L}*(?:\\s+продукт\\p{L}*)?|frozen(?:\\s+food)?${R}|tiefk(?:ü|u)hl(?:kost|produkte?|waren)?)`, 'gu')],
  ['ready-meals', word('готов\\p{L}*\\s+(?:страв\\p{L}*|їж\\p{L}*|обід\\p{L}*)|fertiggericht\\p{L}*|fertigessen|ready[\\s-]?meals?|ready[\\s-]?made')],
  ['baby', word('дитяч\\p{L}*\\s+(?:товар\\p{L}*|харчуван\\p{L}*|їж\\p{L}*)|товар\\p{L}*\\s+для\\s+дітей|babyprodukt\\p{L}*|babyartikel|baby\\s+(?:products|food|stuff)')],
  ['pets', word('товар\\p{L}*\\s+для\\s+(?:тварин|котів|собак)|зоотовар\\p{L}*|tierbedarf|haustier\\p{L}*|pet\\s+(?:supplies|products)')],
  ['household', word('побутов\\p{L}*\\s+(?:хімі\\p{L}*|товар\\p{L}*)|господарськ\\p{L}*\\s+товар\\p{L}*|haushalts(?:waren|artikel|produkte)|haushalt|household(?:\\s+(?:goods|products))?')],
  ['beauty', word('косметик\\p{L}*|краса|гігієн\\p{L}*|kosmetik|k(?:ö|o)rperpflege|beauty|cosmetics|personal\\s+care|hygiene')],
  ['pantry', word('бакалі\\p{L}*|vorratskammer|pantry')],
];

const WITH = '(?:до|під|на|для|zu(?:m|r)?|mit|for|with|to)';
const OCCASION_WORDS: [Occasion, RegExp][] = [
  ['beer', word(`${WITH}\\s+(?:пив(?:о|а|у|ом)?|bier\\p{L}*|beers?)|(?:beer|bier)[\\s-]?snacks?`)],
  ['wine', word(`${WITH}\\s+(?:вин(?:о|а|у|ом)?|wein\\p{L}*|wine)`)],
  ['tea', word(`${WITH}\\s+(?:чаю|чай|чаєм|tee|tea)`)],
  ['coffee', word(`${WITH}\\s+(?:кав(?:а|и|у|ою)|kaffee|coffee)`)],
  ['breakfast', word('на\\s+сніданок|на\\s+сніданку|до\\s+сніданку|сніданок|zum\\s+fr(?:ü|u)hst(?:ü|u)ck|fr(?:ü|u)hst(?:ü|u)ck|for\\s+breakfast|breakfast')],
  ['lunch', word('на\\s+обід|обід|zum\\s+mittagessen|mittagessen|for\\s+lunch|lunch')],
  ['dinner', word('на\\s+вечерю|вечер(?:я|ю)|zum\\s+abendessen|abendessen|for\\s+dinner|dinner')],
  ['barbecue', word('на\\s+шашлик\\p{L}*|шашлик\\p{L}*|на\\s+гриль|для\\s+гриля|на\\s+барбекю|барбекю|zum\\s+grillen|grillen|for\\s+(?:a\\s+)?(?:bbq|barbecue|grill)|bbq|barbecue')],
  ['party', word('на\\s+вечірк\\p{L}*|для\\s+вечірк\\p{L}*|вечірк\\p{L}*|на\\s+свято|zur\\s+party|f(?:ü|u)r\\s+(?:die|eine)\\s+party|for\\s+(?:a\\s+)?party|party|feier')],
  ['picnic', word('на\\s+пікнік|пікнік|zum\\s+picknick|picknick|picnic')],
  ['dessert', word('на\\s+десерт|десерт|zum\\s+nachtisch|nachtisch|for\\s+dessert|dessert')],
  ['movie', word('до\\s+фільму|під\\s+фільм|на\\s+кіно|для\\s+кіно|zum\\s+film|filmabend|movie\\s+night|for\\s+(?:a\\s+)?(?:movie|film)')],
  ['sandwich', word('на\\s+бутерброд\\p{L}*|для\\s+бутербродів|бутерброд\\p{L}*|f(?:ü|u)r\\s+(?:belegte\\s+)?brote|belegte\\s+brote|for\\s+sandwiches|sandwiches')],
  ['birthday', word('на\\s+день\\s+народження|день\\s+народження|zum\\s+geburtstag|geburtstag|for\\s+(?:a\\s+)?birthday|birthday')],
];

/** Слова-прохання: "що купити", "ich suche"; прибираються, лише коли в запиті є щось розібране */
const FILLER = word(
  'що\\s+купити|що|щось|купити|хочу|потрібн\\p{L}*|шукаю|покажи|мені|будь\\s+ласка|please|show\\s+me|i\\s+need|i\\s+want|i\\s+am\\s+looking\\s+for|looking\\s+for|something|ich\\s+(?:brauche|suche|m(?:ö|o)chte)|suche|brauche|etwas|bitte|zeig\\s+mir|kaufen|buy',
);

/** Закуски до пива — це вже нагода, а не ще одне поняття */
const OCCASION_FILLER = word(
  'закуск\\p{L}*|snacks?|knabber\\p{L}*|food|essen|їжа|їжу',
);

/** "молоко і хліб", "Milch und Brot", "milk, bread" */
const CONJUNCTION = /\s*(?:[,;+&/]|(?<![\p{L}\p{N}])(?:і|та|й|и|und|and)(?![\p{L}\p{N}]))\s*/u;

const cut = (text: string, rule: RegExp) => text.replace(rule, ' ');

function firstMatch(text: string, rule: RegExp) {
  rule.lastIndex = 0;
  return rule.exec(text);
}

/** Зайві пробіли, розділові знаки й сполучники на краях після вилучених фраз */
const EDGE_WORD = '(?:і|та|й|и|und|and|для|на|з|für|for|to|mit|with)';
const tidy = (text: string) =>
  text
    .replace(/[“”"«»!?:]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(new RegExp(`^${EDGE_WORD}\\s+`, 'u'), '')
    .replace(new RegExp(`\\s+${EDGE_WORD}$`, 'u'), '')
    .replace(/^[\s,;.\-–]+|[\s,;.\-–]+$/gu, '')
    .trim();

export function parseQuery(query: string): ParsedQuery {
  let text = query.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
  const parsed: ParsedQuery = { concepts: [], categories: [], text: '' };

  // Ціна: діапазон, верхня й нижня межа; лише з валютою ("до 2 кг" — не ціна)
  for (const m of text.matchAll(RANGE)) {
    const cur = m[2] ?? m[4];
    if (!cur || parsed.maxPrice !== undefined) continue;
    parsed.minPrice = number(m[1]);
    parsed.maxPrice = number(m[3]);
    parsed.currency = currencyOf(cur);
    text = text.replace(m[0], ' ');
  }
  for (const [rule, key] of [
    [MAX_PRICE, 'maxPrice'],
    [MIN_PRICE, 'minPrice'],
  ] as const) {
    for (const m of text.matchAll(rule)) {
      const cur = m[1] ?? m[3];
      const value = number(m[2]);
      if (!cur || !(value > 0) || parsed[key] !== undefined) continue;
      parsed[key] = value;
      parsed.currency ??= currencyOf(cur);
      text = text.replace(m[0], ' ');
    }
  }

  if (firstMatch(text, SORT_CHEAP)) {
    parsed.sort = 'price-asc';
    text = cut(text, SORT_CHEAP);
  }

  for (const [slug, rule] of CATEGORY_WORDS) {
    if (!firstMatch(text, rule)) continue;
    parsed.categories.push(slug);
    text = cut(text, rule);
  }

  for (const [slug, rule] of OCCASION_WORDS) {
    if (!firstMatch(text, rule)) continue;
    parsed.occasion ??= slug;
    text = cut(text, rule);
  }

  // Слова дієти лишаються в тексті, але поняття шукаємо без них: "без глютену макарони"
  let conceptText = text;
  let earliest = Infinity;
  for (const [diet, rule] of DIETS) {
    const hit = firstMatch(text, rule);
    if (hit && hit.index < earliest) {
      earliest = hit.index;
      parsed.diet = diet;
    }
    conceptText = cut(conceptText, rule);
  }

  const found =
    parsed.maxPrice !== undefined ||
    parsed.minPrice !== undefined ||
    parsed.sort ||
    parsed.occasion ||
    parsed.categories.length;
  if (found) {
    text = cut(text, FILLER);
    conceptText = cut(conceptText, FILLER);
  }
  if (parsed.occasion) {
    text = cut(text, OCCASION_FILLER);
    conceptText = cut(conceptText, OCCASION_FILLER);
  }
  parsed.text = tidy(text);

  for (const segment of tidy(conceptText).split(CONJUNCTION)) {
    const concept = segment.trim() ? queryConcept(segment) : null;
    if (concept && !parsed.concepts.includes(concept))
      parsed.concepts.push(concept);
  }
  return parsed;
}

/** Поняття нагоди (слаги, що охоплюють і нащадків) */
export const occasionConcepts = (occasion: Occasion): readonly string[] =>
  OCCASIONS[occasion];

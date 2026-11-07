import { stripQuantity } from './normalization/quantity';
import {
  fold,
  slugify,
  Token,
  tokenize,
  transliterate,
} from './normalization/text';

/**
 * Ознаки назви товару для нечіткого зіставлення:
 *
 *   "Напій Coca-Cola Zero безалкогольний сильногазований 0,5л", бренд "Coca-Cola"
 *     → brand "coca-cola", tokens [], attributes { sugar: zero, gas: sparkling }
 *   "Паста сиркова Яготинське для дітей банан 3,9% 90г", бренд "Яготинське для дітей"
 *     → brand "iahotynske-dlia-ditei", tokens [паста, сиркова, банан], attributes { percent: 3.9 }
 */
export interface NameFeatures {
  /** Ключ бренду латиницею: "coca-cola", "morshynska"; null — бренд невідомий */
  brand: string | null;
  /** Значущі слова назви: без бренду, фасування, службових слів та ознак */
  tokens: Token[];
  /** Ознаки, що відрізняють різновиди одного товару: { sugar: 'zero', percent: '2.5' } */
  attributes: Record<string, string>;
  /** Як ці ознаки записані в назві: "без цукру", "2,5%" — для підписів */
  attributeLabels: string[];
  /** Слова-смаки (банан, cherry) — для групування смаків у лінійку */
  flavours: Token[];
  /**
   * Пропозиція на кілька товарів одразу: "Grill- oder Ofenkäse", "в асортименті"
   * (PRD-30). Це не конкретний товар — зіставляється лише з такою самою пропозицією.
   */
  choice?: true;
}

/**
 * Слова вибору в назві. "або" не враховується: в українських мережах це стан
 * товару ("свіжоморожений або дефростований"), а не вибір між товарами.
 */
const CHOICE =
  /(^|[\s,(-])(oder|versch\.|verschiedene|sortiert|в асортименті)(?=$|[\s,.)])/iu;

type AttributeRule = { group: string; value: string; phrases: string[] };

/**
 * Ознаки різновиду. Фраза — слова через пробіл; "*" у кінці слова — будь-яке закінчення.
 * Перша фраза, що збіглася, займає свої слова, тож "негазована" не стане "газованою".
 */
const ATTRIBUTE_RULES: AttributeRule[] = [
  {
    group: 'sugar',
    value: 'zero',
    phrases: [
      'zero',
      'зеро',
      'без цукру',
      'без сахару',
      'zuckerfrei',
      'ohne zucker*',
      'sugar free',
      'sugarfree',
      'no sugar',
    ],
  },
  {
    group: 'sugar',
    value: 'light',
    phrases: ['light', 'lite', 'лайт', 'diet'],
  },
  {
    group: 'caffeine',
    value: 'free',
    phrases: [
      'koffeinfrei',
      'entkoffeiniert',
      'decaf*',
      'без кофеїну',
      'caffeine free',
    ],
  },
  {
    group: 'lactose',
    value: 'free',
    phrases: [
      'безлактозн*',
      'laktosefrei',
      'lactosefrei',
      'lactose free',
      'без лактози',
    ],
  },
  {
    group: 'organic',
    value: 'bio',
    phrases: ['bio', 'органічн*', 'organic', 'öko'],
  },
  {
    group: 'gas',
    value: 'still',
    phrases: [
      'негазован*',
      'без газу',
      'still',
      'naturell',
      'ohne kohlensäure',
    ],
  },
  { group: 'gas', value: 'medium', phrases: ['слабогазован*', 'medium'] },
  {
    group: 'gas',
    value: 'sparkling',
    phrases: ['сильногазован*', 'газован*', 'sprudel*', 'spritzig'],
  },
];

type Pattern = { word: string; prefix: boolean };
/**
 * "Безалкогольне" у пиві чи вині — інший товар, а в газованій воді просто слово з етикетки,
 * тому ознака діє лише разом зі словом алкогольного напою (AUD-02, еталон черги).
 */
const ALCOHOL_FREE =
  /безалкогольн|alkoholfrei|alcohol[- ]free|(?<![\d,.])0[,.]0\s*%/iu;
const ALCOHOL_DRINK =
  /(?<![\p{L}])(пиво|вино|джин|ром|сидр|бренді|віскі|лікер|bier|wein|sekt|gin|rum|cider|helles|pils|radler|weizen)/iu;

const RULES = ATTRIBUTE_RULES.flatMap((rule) =>
  rule.phrases.map((phrase) => ({
    group: rule.group,
    value: rule.value,
    words: phrase.split(' ').map<Pattern>((word) => ({
      word: fold(word.replace(/\*$/, '')),
      prefix: word.endsWith('*'),
    })),
  })),
);

/** Службові слова: тип упаковки, прийменники, "напій", "versch. Sorten" */
const STOP_WORDS = new Set(
  [
    // українська
    'напій',
    'напої',
    'безалкогольний',
    'безалкогольна',
    'безалкогольне',
    'пет',
    'пляшка',
    'пляшці',
    'скло',
    'склі',
    'скляна',
    'пакет',
    'пакеті',
    'упаковка',
    'уп',
    'шт',
    'тм',
    'та',
    'і',
    'й',
    'з',
    'зі',
    'із',
    'в',
    'у',
    'на',
    'для',
    'від',
    'до',
    'по',
    'або',
    'чи',
    'ваговий',
    // «2,5% жиру» — жирність уже в атрибуті percent
    'жиру',
    'вагова',
    'вагове',
    'вагові',
    'класична',
    'класичний',
    'класичне',
    'оригінальний',
    'оригінальна',
    // німецька
    'und',
    'mit',
    'oder',
    'der',
    'die',
    'das',
    'im',
    'in',
    'aus',
    'von',
    'vom',
    'zum',
    'zur',
    'für',
    'je',
    'ca',
    'flasche',
    'fl',
    'dose',
    'packung',
    'packg',
    'becher',
    'glas',
    'pet',
    'beutel',
    'netz',
    'schale',
    'stück',
    'st',
    'stk',
    'kiste',
    'ka',
    'versch',
    'verschiedene',
    'sorten',
    'sorte',
    'lose',
    // англійська
    'and',
    'with',
    'the',
    'of',
    'original',
    'classic',
    // "Coca-Cola Original Taste" (ALDI Nord) — те саме, що "Cola Original"
    'taste',
  ].map(fold),
);

/** Смаки — не впливають на оцінку схожості, лише на групування в лінійку */
const FLAVOURS = new Set(
  [
    'вишня',
    'вишнева',
    'cherry',
    'kirsche',
    'лимон',
    'лимонна',
    'lemon',
    'zitrone',
    'апельсин',
    'апельсинова',
    'orange',
    'малина',
    'малинова',
    'raspberry',
    'himbeere',
    'полуниця',
    'полунична',
    'strawberry',
    'erdbeere',
    'банан',
    'бананова',
    'banana',
    'персик',
    'персикова',
    'peach',
    'pfirsich',
    'яблуко',
    'яблучна',
    'apple',
    'apfel',
    'ваніль',
    'ванільна',
    'vanilla',
    'vanille',
    'шоколад',
    'шоколадна',
    'chocolate',
    'schoko',
    'карамель',
    'caramel',
    'karamell',
    'кокос',
    'coconut',
    'kokos',
    'лайм',
    'lime',
    'limette',
    'манго',
    'mango',
    'чорниця',
    'blueberry',
    'heidelbeere',
    'абрикос',
    'aprikose',
    'груша',
    'birne',
    'слива',
    'pflaume',
    'ананас',
    'ананасова',
    'pineapple',
    'ківі',
    'kiwi',
    'мʼята',
    'mint',
    'minze',
    'горіх',
    'haselnuss',
    'мед',
    'honig',
    'paprika',
    'паприка',
  ].map(fold),
);

const PERCENT = /^(\d+(?:\.\d+)?)%$/;
/** Кількість штук поруч з вагою чи обʼємом: "Пакети 60л 20шт" ≠ "Пакети 60л 40шт" */
const PIECES = /(?<![\p{L}\d.,])(\d+)\s*(?:шт|stk|stück|st|pcs)(?![\p{L}])/iu;
const PLACEHOLDER_BRANDS = new Set([
  'bez-tm',
  'bez-torhovoi-marky',
  'no-name',
  'noname',
]);

/** Ключ бренду: "Coca Cola", "COCA-COLA" → "coca-cola"; "Моршинська" → "morshynska" */
export function brandKey(raw?: string | null): string | null {
  if (!raw || PLACEHOLDER_BRANDS.has(slugify(raw))) return null;
  const key = slugify(
    raw.replace(/[®™©]/g, ' ').replace(/(^|\s)(тм|tm)(\s|$)/giu, ' '),
  );
  return key || null;
}

/** Слова бренду для пошуку в назві, транслітеровані: "Coca-Cola" → [coca, cola] */
export function brandWords(raw: string): string[] {
  return tokenize(raw).map((t) => transliterate(t.norm));
}

function matchesAt(tokens: Token[], at: number, words: Pattern[]): boolean {
  return words.every((pattern, offset) => {
    const token = tokens[at + offset];
    if (!token) return false;
    return pattern.prefix
      ? token.norm.startsWith(pattern.word)
      : token.norm === pattern.word;
  });
}

/** Забирає з токенів ознаки різновиду, повертає решту слів */
function takeAttributes(
  tokens: Token[],
  attributes: Record<string, string>,
  labels: string[],
): Token[] {
  const rest: Token[] = [];
  const percents: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const percent = PERCENT.exec(tokens[i].norm);
    if (percent) {
      percents.push(String(Number(percent[1])));
      labels.push(tokens[i].surface.replace('.', ','));
      continue;
    }
    const rule = RULES.find((r) => matchesAt(tokens, i, r.words));
    if (!rule) {
      rest.push(tokens[i]);
      continue;
    }
    attributes[rule.group] ??= rule.value;
    labels.push(
      tokens
        .slice(i, i + rule.words.length)
        .map((t) => t.surface)
        .join(' '),
    );
    i += rule.words.length - 1;
  }
  if (percents.length > 0 && attributes.percent === undefined) {
    attributes.percent = [...new Set(percents)].sort().join(',');
  }
  return rest;
}

export function extractFeatures(
  name: string,
  rawBrand?: string | null,
): NameFeatures {
  const attributes: Record<string, string> = {};
  const attributeLabels: string[] = [];
  const nameTokens = takeAttributes(
    tokenize(stripQuantity(name)),
    attributes,
    attributeLabels,
  );
  // Бренд теж може нести ознаку: "GUT BIO" — органічна власна марка ALDI
  if (rawBrand) takeAttributes(tokenize(rawBrand), attributes, []);
  if (ALCOHOL_FREE.test(name) && ALCOHOL_DRINK.test(name)) {
    attributes.alcohol = 'free';
  }
  const pieces = PIECES.exec(name);
  if (pieces && Number(pieces[1]) > 1)
    attributes.pieces = String(Number(pieces[1]));

  const brand = brandKey(rawBrand);
  const brandTranslit = new Set(brand && rawBrand ? brandWords(rawBrand) : []);

  const tokens: Token[] = [];
  for (let i = 0; i < nameTokens.length; i++) {
    const token = nameTokens[i];
    if (STOP_WORDS.has(token.norm)) continue;
    if (brandTranslit.has(transliterate(token.norm))) continue;
    if (token.norm.length < 2 && !/\d/.test(token.norm)) continue;
    // "без глютену", "ohne Gentechnik" — заперечення лишаємо разом зі словом
    const next = nameTokens[i + 1];
    if ((token.norm === 'без' || token.norm === 'ohne') && next) {
      tokens.push({
        norm: `${token.norm} ${next.norm}`,
        surface: `${token.surface} ${next.surface}`,
      });
      i++;
      continue;
    }
    tokens.push(token);
  }

  return {
    brand,
    tokens,
    attributes,
    attributeLabels,
    flavours: tokens.filter((t) => FLAVOURS.has(t.norm)),
    ...(CHOICE.test(name) && { choice: true as const }),
  };
}

/**
 * Якщо мережа не вказала бренд, шукаємо в назві відомий бренд цієї країни:
 * ALDI Nord "Coca-Cola" (без бренду) → brand "coca-cola", tokens [].
 * Словник — ключ бренду → його слова (транслітеровані), довші бренди перевіряються першими.
 */
export function detectBrand(
  features: NameFeatures,
  dictionary: { key: string; words: string[] }[],
): NameFeatures {
  if (features.brand || features.tokens.length === 0) return features;
  const words = features.tokens.map((t) => transliterate(t.norm));
  for (const entry of dictionary) {
    const n = entry.words.length;
    for (let at = 0; at + n <= words.length; at++) {
      if (entry.words.every((w, k) => words[at + k] === w)) {
        const tokens = features.tokens.filter((_, i) => i < at || i >= at + n);
        return {
          ...features,
          brand: entry.key,
          tokens,
          flavours: tokens.filter((t) => FLAVOURS.has(t.norm)),
        };
      }
    }
  }
  return features;
}

/** Словник брендів для detectBrand: лише бренди з ≥ 4 літер, що не є звичайними словами */
export function buildBrandDictionary(
  rawBrands: Iterable<string>,
): { key: string; words: string[] }[] {
  const entries = new Map<string, string[]>();
  for (const raw of rawBrands) {
    const key = brandKey(raw);
    if (!key || key.replace(/-/g, '').length < 4 || entries.has(key)) continue;
    const norms = tokenize(raw).map((t) => t.norm);
    if (norms.length === 0) continue;
    if (
      norms.length === 1 &&
      (STOP_WORDS.has(norms[0]) || FLAVOURS.has(norms[0]))
    ) {
      continue;
    }
    entries.set(key, norms.map(transliterate));
  }
  return [...entries.entries()]
    .map(([key, words]) => ({ key, words }))
    .sort((a, b) => b.words.length - a.words.length);
}

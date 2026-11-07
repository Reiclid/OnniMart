import {
  quantityKey,
  THRESHOLDS,
  variantBlockKeys,
  type ListingInput,
  type QuantityInfo,
  type Thresholds,
} from './catalog-index';
import { extractFeatures, type NameFeatures } from './features';
import type { ParsedQuantity } from './normalization/quantity';
import type { Token } from './normalization/text';
import { scorePair, type Idf } from './similarity';

/**
 * Зіставлення карток без штрихкоду (ALDI, VARUS) з товарами Open Food Facts (PRD-27):
 * OFF — ще одна «мережа без цін», а знайдений товар дає картці GTIN.
 * Ті самі ознаки й оцінка, що й у CatalogIndex; блоки — країна + фасування + спільне слово.
 */

export interface OffProduct {
  gtin: string;
  /** Країна з countries_tags OFF, ISO 3166-1 alpha-2 */
  country: string;
  name: string;
  /** brands OFF: часто кілька й не всі правильні («Milbona, Quellbrunn» у води ALDI) */
  brands: string[];
  quantity: ParsedQuantity | null;
  /** Мале фото з OFF — для модератора */
  imageUrl?: string | null;
}

export interface OffCandidate {
  gtin: string;
  score: number;
  /** Однаковий у дублікатів OFF (ті самі слова й ознаки або рушій звів би їх в одне фасування) */
  key: string;
}

export type OffDecision =
  /** Один товар з високою схожістю — його GTIN (дублікати OFF — усі) можна приписати фасуванню */
  | { kind: 'match'; gtins: string[]; score: number }
  /** Середня схожість або кілька рівних — лише людині */
  | { kind: 'review'; candidates: OffCandidate[] }
  | { kind: 'none' };

interface Entry {
  gtin: string;
  /** Країна OFF: товар з кількома countries_tags — окремий запис у кожній */
  country: string;
  /** Країна й фасування */
  block: string;
  /** Як в OFF — для звіту про помилки */
  label: string;
  imageUrl: string | null;
  /** Назва з кожним брендом OFF окремо: кандидат оцінюється за найкращим */
  source: NameFeatures[];
  /** Те саме з поділеними складеними словами — заповнює build() */
  names: NameFeatures[];
  key: string;
}

/** Ключ блоку: країна й фасування; без фасування товар не зіставляємо */
function quantityBlock(
  country: string,
  quantity: QuantityInfo | null,
): string | null {
  const key = quantity ? quantityKey(quantity) : 'none';
  return key === 'none' ? null : `${country}|${key}`;
}

/**
 * Ознаки, які для штрихкоду мусять бути названі з обох боків: «Mineralwasser Medium» і
 * «Mineralwasser classic» без позначки газу — різні товари. Між картками мереж це не так суворо.
 */
const OFF_STRICT_GROUPS = ['gas'];

function oneSided(a: NameFeatures, b: NameFeatures): boolean {
  return OFF_STRICT_GROUPS.some((g) => a.attributes[g] !== b.attributes[g]);
}

/** Частина складеного слова: лише літери, від 4 («Erdbeere» не стає «erd beere») */
const PART = /^\p{L}{4,}$/u;

/** «mehrkornbrot» → [mehr, kornbrot], якщо обидві половини розрізу є словами словника; кожна половина ділиться далі */
function split(word: string, lexicon: ReadonlySet<string>): string[] {
  for (let at = 4; at <= word.length - 4; at++) {
    const left = word.slice(0, at);
    const right = word.slice(at);
    if (
      PART.test(left) &&
      PART.test(right) &&
      lexicon.has(left) &&
      lexicon.has(right)
    ) {
      return [...split(left, lexicon), ...split(right, lexicon)];
    }
  }
  return [word];
}

/**
 * Ділить складені слова на частини, які в назвах цієї країни трапляються окремо:
 * «Langkornreis» і «Langkorn-Reis», «Reine Buttermilch» і «Reine Butter Milch»,
 * «Nudeln, Faden» і «Fadennudeln» стають однаковими словами. Поділ залежить лише від
 * самого слова, а не від сусідів, тож однаковий з обох боків за будь-якого порядку слів.
 */
export function splitCompounds(
  tokens: Token[],
  lexicon: ReadonlySet<string>,
): Token[] {
  return tokens.flatMap((token) => {
    const parts = split(token.norm, lexicon);
    return parts.length === 1
      ? [token]
      : parts.map((norm) => ({ norm, surface: norm }));
  });
}

/**
 * Спершу всі `add` / `addWords`, потім запити: блоки й ключі дублікатів будуються за повним словником
 * при першому `candidates` / `vocabulary`, а кожен наступний `add` скидає їх на повну перебудову.
 */
export class OffIndex {
  /** `${країна}|${gtin}` → запис */
  private readonly entries = new Map<string, Entry>();
  /** GTIN → перший запис: підпис і фото однакові в усіх країнах */
  private readonly byGtin = new Map<string, Entry>();
  private readonly blocks = new Map<string, Set<string>>();
  /** Усі слова назв OFF і карток по країнах — словник для поділу складених слів */
  private readonly lexicon = new Map<string, Set<string>>();
  private readonly listingWords = new Map<string, string[][]>();
  /** Поділені слова назв OFF і карток по країнах (для IDF); null — індекс треба перебудувати */
  private words: Map<string, string[][]> | null = null;

  constructor(private readonly thresholds: Thresholds = THRESHOLDS) {}

  /** Різних GTIN */
  get size(): number {
    return this.byGtin.size;
  }

  /**
   * false — товар без фасування чи бренду, його ніколи не запропонуємо: за самою назвою
   * («Grüne Oliven») кандидатів десятки, а хибний штрихкод гірший за жоден
   */
  add(product: OffProduct): boolean {
    const id = `${product.country}|${product.gtin}`;
    const block = quantityBlock(product.country, product.quantity);
    if (!block || !product.brands.length || this.entries.has(id)) return false;
    const source = product.brands.map((brand) =>
      extractFeatures(product.name, brand),
    );
    const entry: Entry = {
      gtin: product.gtin,
      country: product.country,
      block,
      label: `${product.brands.join(', ')} · ${product.name}`,
      imageUrl: product.imageUrl ?? null,
      source,
      names: source,
      key: '',
    };
    this.entries.set(id, entry);
    if (!this.byGtin.has(product.gtin)) this.byGtin.set(product.gtin, entry);
    const lexicon = this.lexiconOf(product.country);
    for (const features of source)
      for (const t of features.tokens) lexicon.add(t.norm);
    this.words = null;
    return true;
  }

  /** Слова назв карток країни (як prepareListings().vocabulary): словник складених слів і IDF */
  addWords(country: string, docs: string[][]): void {
    const lexicon = this.lexiconOf(country);
    for (const doc of docs) for (const word of doc) lexicon.add(word);
    const listed = this.listingWords.get(country) ?? [];
    for (const doc of docs) listed.push(doc);
    this.listingWords.set(country, listed);
    this.words = null;
  }

  /** Поділені слова товарів OFF і карток по країнах — для IDF */
  get vocabulary(): ReadonlyMap<string, string[][]> {
    return this.build();
  }

  /** Блоки й ключі дублікатів — лише після поділу складених слів за повним словником */
  private build(): Map<string, string[][]> {
    if (this.words) return this.words;
    const words = new Map<string, string[][]>();
    const docsOf = (country: string) => {
      let docs = words.get(country);
      if (!docs) words.set(country, (docs = []));
      return docs;
    };
    this.blocks.clear();
    for (const [id, entry] of this.entries) {
      entry.names = entry.source.map((f) => this.merge(entry.country, f));
      const { tokens, attributes } = entry.names[0];
      entry.key = `${entry.block}|${tokens
        .map((t) => t.norm)
        .sort()
        .join(' ')}|${JSON.stringify(Object.entries(attributes).sort())}`;
      for (const features of entry.names) {
        for (const key of variantBlockKeys(entry.block, features)) {
          let set = this.blocks.get(key);
          if (!set) this.blocks.set(key, (set = new Set()));
          set.add(id);
        }
      }
      docsOf(entry.country).push(tokens.map((t) => t.norm));
    }
    for (const [country, docs] of this.listingWords) {
      const lexicon = this.lexiconOf(country);
      for (const doc of docs) {
        const tokens = doc.map((norm) => ({ norm, surface: norm }));
        docsOf(country).push(
          splitCompounds(tokens, lexicon).map((t) => t.norm),
        );
      }
    }
    return (this.words = words);
  }

  private lexiconOf(country: string): Set<string> {
    let lexicon = this.lexicon.get(country);
    if (!lexicon) this.lexicon.set(country, (lexicon = new Set()));
    return lexicon;
  }

  private merge(country: string, features: NameFeatures): NameFeatures {
    const tokens = splitCompounds(features.tokens, this.lexiconOf(country));
    return tokens.length === features.tokens.length
      ? features
      : { ...features, tokens };
  }

  /** Кандидати тієї самої країни й фасування, від найсхожішого */
  candidates(listing: ListingInput, idf: Idf): OffCandidate[] {
    const block = quantityBlock(listing.country, listing.quantity);
    if (!block || !listing.features.brand) return [];
    this.build();
    const features = this.merge(listing.country, listing.features);
    const ids = new Set<string>();
    for (const key of variantBlockKeys(block, features)) {
      for (const id of this.blocks.get(key) ?? []) ids.add(id);
    }
    const scored: (OffCandidate & { entry: Entry })[] = [];
    for (const id of ids) {
      const entry = this.entries.get(id)!;
      const score = Math.max(
        ...entry.names.map((n) =>
          oneSided(features, n) ? 0 : scorePair(features, n, idf).score,
        ),
      );
      if (score > 0)
        scored.push({ gtin: entry.gtin, score, key: entry.key, entry });
    }
    scored.sort((a, b) => b.score - a.score);
    // Дублікати OFF рідко названі однаково («Молоко 2,5% ультрапастеризоване» і «… жиру, …»):
    // записи, які рушій сам звів би в одне фасування з найкращим, — той самий товар
    if (!scored.length) return [];
    const top = scored[0].entry;
    for (const c of scored.slice(1)) {
      if (c.key !== top.key && this.same(top, c.entry, idf)) c.key = top.key;
    }
    return scored.map(({ gtin, score, key }) => ({ gtin, score, key }));
  }

  private same(a: Entry, b: Entry, idf: Idf): boolean {
    return b.names.some(
      (n) => scorePair(a.names[0], n, idf).score >= this.thresholds.auto,
    );
  }

  /** GTIN є в OFF хоч якоїсь країни */
  has(gtin: string): boolean {
    return this.byGtin.has(gtin);
  }

  /** GTIN є серед товарів OFF цієї країни — лише такий картці можна приписати */
  hasIn(country: string, gtin: string): boolean {
    return this.entries.has(`${country}|${gtin}`);
  }

  labelOf(gtin: string): string | undefined {
    return this.byGtin.get(gtin)?.label;
  }

  imageOf(gtin: string): string | null {
    return this.byGtin.get(gtin)?.imageUrl ?? null;
  }

  decide(listing: ListingInput, idf: Idf): OffDecision {
    return offDecision(this.candidates(listing, idf), this.thresholds);
  }
}

/** Рішення за відсортованими кандидатами — окремо, щоб оцінка перебирала пороги без перебудови */
export function offDecision(
  scored: OffCandidate[],
  thresholds: Thresholds = THRESHOLDS,
): OffDecision {
  const [best] = scored;
  if (!best || best.score < thresholds.review) return { kind: 'none' };
  // Той самий товар під кількома GTIN — усі, хоч і з трохи нижчою схожістю до картки
  const same = scored.filter(
    (c) => c.key === best.key && c.score >= thresholds.review,
  );
  const next = scored.find((c) => !same.includes(c));
  if (
    best.score >= thresholds.auto &&
    (!next || best.score - next.score >= thresholds.margin)
  ) {
    return { kind: 'match', gtins: same.map((c) => c.gtin), score: best.score };
  }
  return {
    kind: 'review',
    candidates: scored.filter((c) => c.score >= thresholds.review).slice(0, 3),
  };
}

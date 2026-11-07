import type { NameFeatures } from './features';
import type { Measure } from './normalization/quantity';
import {
  buildIdf,
  differsOnlyByVariation,
  Idf,
  PairScore,
  scorePair,
} from './similarity';
import type { Variations } from './variations';
import { isRuleOn, MatchRule, RuleSwitches } from './rules';

export interface QuantityInfo {
  measure: Measure | null;
  netQuantity: number | null;
  packCount: number;
  isWeighted: boolean;
}

/** Пороги рішень (див. docs/02-database.md, експеримент — scripts/evaluate-matching.ts) */
export const THRESHOLDS = {
  /** Від цієї схожості картка зіставляється автоматично */
  auto: 0.9,
  /** Від цієї — пропонується модератору */
  review: 0.7,
  /** Найкращий кандидат має відриватися від другого хоча б на стільки */
  margin: 0.05,
  /** Схожість товару (без урахування фасування), щоб додати картку як нове фасування */
  product: 0.9,
  /**
   * Різні штрихкоди не заважають автоматичному зіставленню лише за повного збігу
   * нормалізованих назв: експеримент показав, що це той самий товар з іншим GTIN
   */
  barcodeOverride: 0.99,
  /**
   * Мінімальна схожість з товаром іншої країни. Назви різними мовами дають
   * випадкові часткові збіги, тож зіставляємо лише повний збіг бренду, назви
   * й фасування ("Coca-Cola 1,25 л" в Україні й Німеччині) і без модерації.
   */
  crossCountry: 0.99,
};

export type Thresholds = typeof THRESHOLDS;

/** "VOLUME:500:1", "MASS:1000:1:w" (ваговий), "none" — фасування невідоме */
export function quantityKey(q: QuantityInfo): string {
  if (!q.measure || !q.netQuantity) return 'none';
  return `${q.measure}:${Math.round(q.netQuantity)}:${q.packCount}${q.isWeighted ? ':w' : ''}`;
}

export interface ListingInput {
  id: string;
  chainId: string;
  country: string;
  barcodes: string[];
  quantity: QuantityInfo;
  features: NameFeatures;
}

export interface CandidateScore extends PairScore {
  variantId: string;
  /**
   * В обох є штрихкоди, і жоден не збігається. Буває й в одного товару
   * (імпортний і місцевий GTIN, нова упаковка), тож це не заборона, а привід
   * віддати пару модератору замість автоматичного зіставлення.
   */
  barcodeMismatch?: boolean;
  /** Фасування поки продається лише в інших країнах */
  foreign?: boolean;
}

export type MatchDecision =
  /** Штрихкод уже відомий */
  (
    | { kind: 'barcode'; variantId: string }
    /** Висока схожість з наявним фасуванням */
    | { kind: 'fuzzy'; variantId: string; score: number }
    /** Середня схожість — у чергу модерації */
    | { kind: 'review'; candidates: CandidateScore[] }
    /** Той самий товар, але іншого фасування — нове фасування наявного товару */
    | { kind: 'variant'; productId: string; score: number }
    /** Схожого немає — новий товар */
    | { kind: 'product' }
  ) & {
    /** Правила, що вплинули на рішення (/admin/rules) */
    rules?: MatchRule[];
  };

interface VariantEntry {
  id: string;
  productId: string;
  quantityKey: string;
  /** Назви товару й усіх зіставлених карток — кандидат оцінюється за найкращою */
  names: NameFeatures[];
  barcodes: Set<string>;
  chains: Set<string>;
  countries: Set<string>;
}

interface ProductEntry {
  id: string;
  features: NameFeatures;
  quantityKeys: Set<string>;
  countries: Set<string>;
}

/**
 * Каталог у памʼяті для пакетного зіставлення. Щоб не порівнювати все з усім,
 * кандидатів відбираємо блоками: те саме фасування і хоча б одне спільне слово
 * (за першими 4 літерами), а для нових фасувань — той самий бренд.
 * Кандидати своєї країни мають пріоритет; товар іншої країни — лише за повного збігу.
 */
export class CatalogIndex {
  private readonly variants = new Map<string, VariantEntry>();
  private readonly products = new Map<string, ProductEntry>();
  private readonly byBarcode = new Map<string, string>();
  private readonly variantBlocks = new Map<string, Set<string>>();
  private readonly productBlocks = new Map<string, Set<string>>();
  private readonly rejected = new Set<string>();
  private readonly idfs = new Map<string, Idf>();
  private variations: Variations | undefined;
  private rules: RuleSwitches = {};

  constructor(private readonly thresholds: Thresholds = THRESHOLDS) {}

  /** IDF слів окремо для кожної країни (різні мови) */
  setVocabulary(country: string, documents: string[][]): void {
    this.idfs.set(country, buildIdf(documents));
  }

  /** Готовий IDF (кешований між пакетами інкрементального зіставлення) */
  setIdf(country: string, idf: Idf): void {
    this.idfs.set(country, idf);
  }

  /** Вивчені варіації (learnVariations): різні варіації — різні товари, незалежно від мови */
  setVariations(variations: Variations): void {
    this.variations = variations;
  }

  /** Вимкнені модератором правила (таблиця matching_rules) */
  setRules(rules: RuleSwitches): void {
    this.rules = rules;
  }

  private on(rule: MatchRule): boolean {
    return isRuleOn(this.rules, rule);
  }

  /** Варіації, якщо правило увімкнене */
  private get activeVariations(): Variations | undefined {
    return this.on('variations') ? this.variations : undefined;
  }

  idf(country: string): Idf {
    let idf = this.idfs.get(country);
    if (!idf) {
      idf = buildIdf([]);
      this.idfs.set(country, idf);
    }
    return idf;
  }

  addProduct(id: string, features: NameFeatures, country: string): void {
    let product = this.products.get(id);
    if (!product) {
      product = { id, features, quantityKeys: new Set(), countries: new Set() };
      this.products.set(id, product);
    }
    product.countries.add(country);
    const brand = brandBlockKey(features);
    if (brand) this.block(this.productBlocks, brand, id);
  }

  addVariant(id: string, productId: string, quantity: string): void {
    if (this.variants.has(id)) return;
    this.variants.set(id, {
      id,
      productId,
      quantityKey: quantity,
      names: [],
      barcodes: new Set(),
      chains: new Set(),
      countries: new Set(),
    });
    this.products.get(productId)?.quantityKeys.add(quantity);
  }

  addBarcode(variantId: string, gtin: string): void {
    if (this.byBarcode.has(gtin)) return;
    this.byBarcode.set(gtin, variantId);
    this.variants.get(variantId)?.barcodes.add(gtin);
  }

  /** Додає назву (товару або зіставленої картки) і робить фасування видимим у країні */
  addName(
    variantId: string,
    features: NameFeatures,
    country: string,
    chainId?: string,
  ): void {
    const variant = this.variants.get(variantId);
    if (!variant) return;
    variant.names.push(features);
    variant.countries.add(country);
    if (chainId) variant.chains.add(chainId);
    for (const key of variantBlockKeys(variant.quantityKey, features)) {
      this.block(this.variantBlocks, key, variantId);
    }
    const product = this.products.get(variant.productId);
    if (product) {
      product.countries.add(country);
      const brand = brandBlockKey(features);
      if (brand) this.block(this.productBlocks, brand, product.id);
    }
  }

  /** Модератор відхилив пару — більше її не пропонуємо */
  reject(listingId: string, variantId: string): void {
    this.rejected.add(`${listingId}|${variantId}`);
  }

  barcodeOwner(gtin: string): string | undefined {
    return this.byBarcode.get(gtin);
  }

  variantOf(
    variantId: string,
  ): { productId: string; quantityKey: string } | undefined {
    return this.variants.get(variantId);
  }

  /** Оцінка схожості картки з кожним допустимим фасуванням того самого розміру */
  scoreCandidates(listing: ListingInput): CandidateScore[] {
    return this.score(listing).scored;
  }

  /**
   * Кандидати і кількість "сусідніх смаків": фасувань цієї країни (будь-якої мережі,
   * і своєї теж) з тією самою назвою, але іншою вивченою варіацією
   * ("Knoppers Riegel Nuss" для "Knoppers Riegel Kokos").
   */
  private score(listing: ListingInput): {
    scored: CandidateScore[];
    siblings: number;
    /** Правила, що відкинули кандидата або знизили йому оцінку */
    fired: Set<MatchRule>;
  } {
    const variations = this.activeVariations;
    const fired = new Set<MatchRule>();
    const idf = this.idf(listing.country);
    const key = quantityKey(listing.quantity);
    const ids = new Set<string>();
    for (const block of variantBlockKeys(key, listing.features)) {
      for (const id of this.variantBlocks.get(block) ?? []) ids.add(id);
    }

    const tokens = listing.features.tokens.map((t) => t.norm);
    const scored: CandidateScore[] = [];
    let siblings = 0;
    for (const id of ids) {
      const variant = this.variants.get(id)!;
      if (
        variant.countries.has(listing.country) &&
        variant.names.some((name) =>
          differsOnlyByVariation(
            tokens,
            name.tokens.map((t) => t.norm),
            variations,
          ),
        )
      ) {
        siblings++;
      }
      const scores = variant.names.map((name) =>
        scorePair(listing.features, name, idf, variations, this.rules),
      );
      // Інша картка тієї самої мережі — це інший товар цієї мережі
      if (variant.chains.has(listing.chainId)) continue;
      if (this.rejected.has(`${listing.id}|${id}`)) continue;
      for (const score of scores) {
        const rule = firedBy(score);
        if (rule) fired.add(rule);
      }
      let best: PairScore | null = null;
      for (const score of scores) {
        if (!best || score.score > best.score) best = score;
      }
      if (!best || best.score <= 0) continue;
      const foreign = !variant.countries.has(listing.country);
      if (foreign && best.score < this.thresholds.crossCountry) continue;
      const barcodeMismatch =
        listing.barcodes.length > 0 &&
        variant.barcodes.size > 0 &&
        !listing.barcodes.some((g) => variant.barcodes.has(g));
      scored.push({
        ...best,
        variantId: id,
        ...(barcodeMismatch && { barcodeMismatch }),
        ...(foreign && { foreign }),
      });
    }
    return {
      scored: scored.sort((a, b) => b.score - a.score),
      siblings,
      fired,
    };
  }

  decide(listing: ListingInput): MatchDecision {
    if (this.on('barcode')) {
      for (const gtin of listing.barcodes) {
        const variantId = this.byBarcode.get(gtin);
        if (variantId) {
          return { kind: 'barcode', variantId, rules: ['barcode'] };
        }
      }
    }

    const { scored, siblings, fired } = this.score(listing);
    const decided = (decision: MatchDecision): MatchDecision =>
      fired.size ? { ...decision, rules: [...fired] } : decision;
    // Спершу — фасування, що вже продаються в цій країні
    let domestic = scored.filter((c) => !c.foreign);
    // Пропозиції на всю лінійку (PRD-30): у блоці ≥ 2 смаки однієї назви, тож
    // назва без смаку — не конкретний товар:
    //   картка "Almighurt" проти "Almighurt Erdbeere" і "… Stracciatella";
    //   картка "Knoppers Riegel Kokos" проти "Knoppers Riegel", коли вже є "… Nuss"
    if (this.on('rangeOffers')) {
      const before = domestic.length;
      if (domestic.filter((c) => c.extraVariation === 'b').length >= 2) {
        domestic = domestic.filter((c) => c.extraVariation !== 'b');
      }
      if (siblings > 0) {
        domestic = domestic.filter((c) => c.extraVariation !== 'a');
      }
      if (domestic.length < before) fired.add('rangeOffers');
    }
    const [best, second] = domestic;
    const trusted =
      best &&
      (!this.on('barcodeMismatch') ||
        !best.barcodeMismatch ||
        best.score >= this.thresholds.barcodeOverride);
    if (best && !trusted && best.score >= this.thresholds.auto) {
      fired.add('barcodeMismatch');
    }
    if (best && trusted && best.score >= this.thresholds.auto) {
      if (!second || best.score - second.score >= this.thresholds.margin) {
        return decided({
          kind: 'fuzzy',
          variantId: best.variantId,
          score: best.score,
        });
      }
      // Назва збіглася повністю, а другий кандидат у межах margin. Кілька повних збігів — це
      // дублікати товару в каталозі, а не вибір для людини (на еталоні черги 118 зі 118
      // правильні): беремо найпоширеніше фасування. Один повний збіг беремо попри близького
      // сусіда. Інший штрихкод у будь-якого з повних збігів лишає пару модератору.
      if (best.score >= 1) {
        const tied = domestic.filter((c) => c.score >= 1 && !c.barcodeMismatch);
        if (tied.length === domestic.filter((c) => c.score >= 1).length) {
          return decided({
            kind: 'fuzzy',
            variantId: this.widest(tied),
            score: best.score,
          });
        }
      }
    }
    if (best && best.score >= this.thresholds.review) {
      return decided({
        kind: 'review',
        candidates: domestic
          .filter((c) => c.score >= this.thresholds.review)
          .slice(0, 3),
      });
    }

    // Той самий товар з іншої країни — лише однозначний повний збіг
    const foreign = this.on('crossCountry')
      ? scored.filter((c) => c.foreign && !c.barcodeMismatch)
      : [];
    if (
      foreign.length === 1 ||
      (foreign.length > 1 &&
        foreign[0].score - foreign[1].score >= this.thresholds.margin)
    ) {
      fired.add('crossCountry');
      return decided({
        kind: 'fuzzy',
        variantId: foreign[0].variantId,
        score: foreign[0].score,
      });
    }

    const product = this.on('newVariant') ? this.bestProduct(listing) : null;
    if (product) {
      fired.add('newVariant');
      return decided({ kind: 'variant', ...product });
    }
    return decided({ kind: 'product' });
  }

  /** Фасування, яке продає найбільше мереж */
  private widest(candidates: CandidateScore[]): string {
    const reach = (c: CandidateScore) =>
      this.variants.get(c.variantId)?.chains.size ?? 0;
    return candidates.reduce((a, b) => (reach(b) > reach(a) ? b : a)).variantId;
  }

  /** Той самий товар (бренд + назва) без такого фасування */
  private bestProduct(
    listing: ListingInput,
  ): { productId: string; score: number } | null {
    const brand = brandBlockKey(listing.features);
    if (!brand) return null;
    const key = quantityKey(listing.quantity);
    const idf = this.idf(listing.country);
    let best: { productId: string; score: number } | null = null;
    for (const id of this.productBlocks.get(brand) ?? []) {
      const product = this.products.get(id)!;
      if (product.quantityKeys.has(key)) continue;
      const { score } = scorePair(
        listing.features,
        product.features,
        idf,
        this.activeVariations,
        this.rules,
      );
      const domestic = product.countries.has(listing.country);
      if (!domestic && !this.on('crossCountry')) continue;
      const threshold = domestic
        ? this.thresholds.product
        : this.thresholds.crossCountry;
      if (score >= threshold && (!best || score > best.score)) {
        best = { productId: id, score };
      }
    }
    return best;
  }

  private block(
    blocks: Map<string, Set<string>>,
    key: string,
    id: string,
  ): void {
    let set = blocks.get(key);
    if (!set) {
      set = new Set();
      blocks.set(key, set);
    }
    set.add(id);
  }
}

/** Правило, через яке пару відкинуто або знижено оцінку; null — правило не з /admin/rules */
function firedBy(score: PairScore): MatchRule | null {
  if (score.conflict === 'choice') return 'choice';
  if (score.conflict === 'variation' || score.extraVariation) {
    return 'variations';
  }
  if (
    score.conflict &&
    score.conflict !== 'brand' &&
    score.conflict !== 'empty'
  ) {
    return 'attributes';
  }
  return null;
}

/** Ключі блоків: перші 4 літери кожного слова; назва лише з бренду — "∅" */
function stems(features: NameFeatures): string[] {
  if (features.tokens.length === 0) return ['∅'];
  return [...new Set(features.tokens.map((t) => t.norm.slice(0, 4)))];
}

/** Блоки кандидатів-фасувань: "VOLUME:500:1|морш" — те саме фасування й спільне слово */
export function variantBlockKeys(
  quantity: string,
  features: NameFeatures,
): string[] {
  return stems(features).map((stem) => `${quantity}|${stem}`);
}

/** Блок товарів того самого бренду (для нового фасування наявного товару) */
export function brandBlockKey(features: NameFeatures): string | null {
  return features.brand ? `b:${features.brand}` : null;
}

/**
 * Ключі пошуку, які зберігаються в БД (match_keys), щоб інкрементальне зіставлення
 * відбирало кандидатів без завантаження всього каталогу. Ті самі, що блоки CatalogIndex.
 */
export function matchKeys(quantity: string, features: NameFeatures): string[] {
  const brand = brandBlockKey(features);
  return [...variantBlockKeys(quantity, features), ...(brand ? [brand] : [])];
}

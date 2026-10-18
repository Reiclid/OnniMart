import type { NameFeatures } from './features';
import type { Measure } from './normalization/quantity';
import { buildIdf, Idf, PairScore, scorePair } from './similarity';

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
  | { kind: 'barcode'; variantId: string }
  /** Висока схожість з наявним фасуванням */
  | { kind: 'fuzzy'; variantId: string; score: number }
  /** Середня схожість — у чергу модерації */
  | { kind: 'review'; candidates: CandidateScore[] }
  /** Той самий товар, але іншого фасування — нове фасування наявного товару */
  | { kind: 'variant'; productId: string; score: number }
  /** Схожого немає — новий товар */
  | { kind: 'product' };

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

  constructor(private readonly thresholds: Thresholds = THRESHOLDS) {}

  /** IDF слів окремо для кожної країни (різні мови) */
  setVocabulary(country: string, documents: string[][]): void {
    this.idfs.set(country, buildIdf(documents));
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
    if (features.brand) this.block(this.productBlocks, features.brand, id);
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
    for (const stem of stems(features)) {
      this.block(
        this.variantBlocks,
        `${variant.quantityKey}|${stem}`,
        variantId,
      );
    }
    const product = this.products.get(variant.productId);
    if (product) {
      product.countries.add(country);
      if (features.brand)
        this.block(this.productBlocks, features.brand, product.id);
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
    const idf = this.idf(listing.country);
    const key = quantityKey(listing.quantity);
    const ids = new Set<string>();
    for (const stem of stems(listing.features)) {
      for (const id of this.variantBlocks.get(`${key}|${stem}`) ?? []) {
        ids.add(id);
      }
    }

    const scored: CandidateScore[] = [];
    for (const id of ids) {
      const variant = this.variants.get(id)!;
      // Інша картка тієї самої мережі — це інший товар цієї мережі
      if (variant.chains.has(listing.chainId)) continue;
      if (this.rejected.has(`${listing.id}|${id}`)) continue;
      let best: PairScore | null = null;
      for (const name of variant.names) {
        const score = scorePair(listing.features, name, idf);
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
    return scored.sort((a, b) => b.score - a.score);
  }

  decide(listing: ListingInput): MatchDecision {
    for (const gtin of listing.barcodes) {
      const variantId = this.byBarcode.get(gtin);
      if (variantId) return { kind: 'barcode', variantId };
    }

    const scored = this.scoreCandidates(listing);
    // Спершу — фасування, що вже продаються в цій країні
    const domestic = scored.filter((c) => !c.foreign);
    const [best, second] = domestic;
    const trusted =
      best &&
      (!best.barcodeMismatch || best.score >= this.thresholds.barcodeOverride);
    if (best && trusted && best.score >= this.thresholds.auto) {
      if (!second || best.score - second.score >= this.thresholds.margin) {
        return { kind: 'fuzzy', variantId: best.variantId, score: best.score };
      }
    }
    if (best && best.score >= this.thresholds.review) {
      return {
        kind: 'review',
        candidates: domestic
          .filter((c) => c.score >= this.thresholds.review)
          .slice(0, 3),
      };
    }

    // Той самий товар з іншої країни — лише однозначний повний збіг
    const foreign = scored.filter((c) => c.foreign && !c.barcodeMismatch);
    if (
      foreign.length === 1 ||
      (foreign.length > 1 &&
        foreign[0].score - foreign[1].score >= this.thresholds.margin)
    ) {
      return {
        kind: 'fuzzy',
        variantId: foreign[0].variantId,
        score: foreign[0].score,
      };
    }

    const product = this.bestProduct(listing);
    if (product) return { kind: 'variant', ...product };
    return { kind: 'product' };
  }

  /** Той самий товар (бренд + назва) без такого фасування */
  private bestProduct(
    listing: ListingInput,
  ): { productId: string; score: number } | null {
    if (!listing.features.brand) return null;
    const key = quantityKey(listing.quantity);
    const idf = this.idf(listing.country);
    let best: { productId: string; score: number } | null = null;
    for (const id of this.productBlocks.get(listing.features.brand) ?? []) {
      const product = this.products.get(id)!;
      if (product.quantityKeys.has(key)) continue;
      const { score } = scorePair(listing.features, product.features, idf);
      const threshold = product.countries.has(listing.country)
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

/** Ключі блоків: перші 4 літери кожного слова; назва лише з бренду — "∅" */
function stems(features: NameFeatures): string[] {
  if (features.tokens.length === 0) return ['∅'];
  return [...new Set(features.tokens.map((t) => t.norm.slice(0, 4)))];
}

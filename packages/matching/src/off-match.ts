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
}

export interface OffCandidate {
  gtin: string;
  score: number;
}

export type OffDecision =
  /** Один кандидат з високою схожістю — GTIN можна приписати фасуванню */
  | { kind: 'match'; gtin: string; score: number }
  /** Середня схожість або кілька рівних — лише людині */
  | { kind: 'review'; candidates: OffCandidate[] }
  | { kind: 'none' };

interface Entry {
  gtin: string;
  /** Як в OFF — для звіту про помилки */
  label: string;
  /** Назва з кожним брендом OFF окремо: кандидат оцінюється за найкращим */
  names: NameFeatures[];
}

/** Ключ блоку: країна й фасування; без фасування товар не зіставляємо */
function quantityBlock(
  country: string,
  quantity: QuantityInfo | null,
): string | null {
  const key = quantity ? quantityKey(quantity) : 'none';
  return key === 'none' ? null : `${country}|${key}`;
}

export class OffIndex {
  private readonly entries = new Map<string, Entry>();
  private readonly blocks = new Map<string, Set<string>>();
  /** Слова назв по країнах — для IDF разом зі словами карток */
  readonly vocabulary = new Map<string, string[][]>();

  constructor(private readonly thresholds: Thresholds = THRESHOLDS) {}

  get size(): number {
    return this.entries.size;
  }

  /**
   * false — товар без фасування чи бренду, його ніколи не запропонуємо: за самою назвою
   * («Grüne Oliven») кандидатів десятки, а хибний штрихкод гірший за жоден
   */
  add(product: OffProduct): boolean {
    const block = quantityBlock(product.country, product.quantity);
    if (!block || !product.brands.length || this.entries.has(product.gtin))
      return false;
    const names = product.brands.map((brand) =>
      extractFeatures(product.name, brand),
    );
    this.entries.set(product.gtin, {
      gtin: product.gtin,
      label: `${product.brands.join(', ')} · ${product.name}`,
      names,
    });
    for (const features of names) {
      for (const key of variantBlockKeys(block, features)) {
        let set = this.blocks.get(key);
        if (!set) this.blocks.set(key, (set = new Set()));
        set.add(product.gtin);
      }
    }
    const docs = this.vocabulary.get(product.country) ?? [];
    docs.push(names[0].tokens.map((t) => t.norm));
    this.vocabulary.set(product.country, docs);
    return true;
  }

  /** Кандидати тієї самої країни й фасування, від найсхожішого */
  candidates(listing: ListingInput, idf: Idf): OffCandidate[] {
    const block = quantityBlock(listing.country, listing.quantity);
    if (!block || !listing.features.brand) return [];
    const ids = new Set<string>();
    for (const key of variantBlockKeys(block, listing.features)) {
      for (const id of this.blocks.get(key) ?? []) ids.add(id);
    }
    const scored: OffCandidate[] = [];
    for (const id of ids) {
      const entry = this.entries.get(id)!;
      const score = Math.max(
        ...entry.names.map((n) => scorePair(listing.features, n, idf).score),
      );
      if (score > 0) scored.push({ gtin: id, score });
    }
    return scored.sort((a, b) => b.score - a.score);
  }

  has(gtin: string): boolean {
    return this.entries.has(gtin);
  }

  labelOf(gtin: string): string | undefined {
    return this.entries.get(gtin)?.label;
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
  const [best, second] = scored;
  if (!best || best.score < thresholds.review) return { kind: 'none' };
  if (
    best.score >= thresholds.auto &&
    (!second || best.score - second.score >= thresholds.margin)
  ) {
    return { kind: 'match', gtin: best.gtin, score: best.score };
  }
  return {
    kind: 'review',
    candidates: scored.filter((c) => c.score >= thresholds.review).slice(0, 3),
  };
}

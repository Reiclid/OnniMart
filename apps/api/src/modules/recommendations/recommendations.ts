/** Рядки БД → кандидати й дії для @repo/ranking, без БД — щоб перевірити тестами */
import { conceptOf } from '@repo/matching';
import type { Candidate, Signal, SignalType } from '@repo/ranking';

/** Ознаки товару з БД (CANDIDATES_SQL у сервісі) */
export interface ProductFacts {
  id: string;
  name: string;
  lineId: string | null;
  brandId: string | null;
  category: string | null;
  chains: string[];
  countries: string[];
  discount: number;
}

export interface UnitPrice {
  id: string;
  currency: string;
  price: number;
}

/**
 * Кандидати в порядку базового пошуку: релевантність 1 → 0 за позицією.
 * Товар без ознак (усі картки зникли) лишається, але без мереж і цін.
 */
export function toCandidates(
  ids: string[],
  facts: ProductFacts[],
  prices: UnitPrice[],
  country: string | null,
): Candidate[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const unitPrices = new Map<string, Record<string, number>>();
  for (const p of prices)
    unitPrices.set(p.id, { ...unitPrices.get(p.id), [p.currency]: p.price });
  return ids.map((id, i) => {
    const f = byId.get(id);
    return {
      id,
      relevance: 1 - i / ids.length,
      category: f?.category ?? null,
      concept: f ? conceptOf(f.name, f.category) : null,
      brand: f?.brandId ?? null,
      line: f?.lineId ?? null,
      chains: f?.chains ?? [],
      discount: f?.discount ?? 0,
      unitPrices: unitPrices.get(id) ?? {},
      inCountry: !country || (f?.countries.includes(country) ?? false),
    };
  });
}

/** Товар, на який указує дія профілю */
export interface SignalProduct {
  name: string;
  brandId: string | null;
  category: string | null;
}

/** Дія користувача: перегляд, підписка або подія (click, chain_click, favourite) */
export interface Action {
  type: SignalType;
  at: Date;
  productId?: string | null;
  chains?: string[];
}

export function toSignals(
  actions: Action[],
  products: Map<string, SignalProduct>,
): Signal[] {
  return actions.map(({ type, at, productId, chains }) => {
    const p = productId ? products.get(productId) : undefined;
    return {
      type,
      at,
      chains,
      category: p?.category,
      concept: p ? conceptOf(p.name, p.category) : null,
      brand: p?.brandId,
    };
  });
}

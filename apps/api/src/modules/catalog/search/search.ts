import { freshOrAll } from '../../quality/freshness';
import {
  conceptOf,
  conceptPath,
  conceptTerms,
  fold,
  transliterate,
} from '@repo/matching';

/** Пошук каталогу в Meilisearch (REST, без SDK). Без MEILI_URL — пошук через SQL ILIKE */

export const PRODUCTS_INDEX = 'products';

export interface SearchDoc {
  id: string;
  name: string;
  /** "Моршинська" → "morshynska": знаходить, коли шукають латиницею */
  nameLatin: string;
  brand: string | null;
  /** Фасування товару: "0,5 л 1,25 л" */
  sizes: string;
  categorySlug: string | null;
  categoryName: string | null;
  /** Поняття і його предки: ["bread", "bakery"] (PRD-19) */
  concepts: string[];
  /** Назви поняття всіма мовами: "хліб" знаходить Brot */
  conceptNames: string[];
  /** Назви споріднених понять — знаходить їх із нижчою вагою: "хліб" → круасан */
  relatedNames: string[];
  lineId: string | null;
  chains: string[];
  /** Країни мереж, де товар продається: ["UA", "DE"] — фільтр пошуку за країною */
  countries: string[];
  /** Мережі й країни, де товар зараз в акції та в наявності: фільтр "Акції" */
  promoChains: string[];
  promoCountries: string[];
  chainsCount: number;
  barcodes: string[];
  minPrice: number | null;
  currency: string | null;
  /** Мітка переіндексації: старіші документи видаляються */
  indexedAt: number;
}

const SYNONYMS: Record<string, string[]> = {
  'кока-кола': ['coca-cola', 'кола'],
  'coca-cola': ['кока-кола'],
  кола: ['cola', 'coca-cola'],
  cola: ['кола'],
  пепсі: ['pepsi'],
  pepsi: ['пепсі'],
  фанта: ['fanta'],
  fanta: ['фанта'],
  спрайт: ['sprite'],
  sprite: ['спрайт'],
  // Бренди кирилицею, коли на етикетці латиниця
  мілка: ['milka'],
  milka: ['мілка'],
  оболонь: ['obolon'],
  рошен: ['roshen'],
  roshen: ['рошен'],
  нестле: ['nestle'],
  нескафе: ['nescafe'],
  якобс: ['jacobs'],
  данон: ['danone'],
  activia: ['активіа'],
};

export const INDEX_SETTINGS = {
  searchableAttributes: [
    'name',
    'nameLatin',
    'brand',
    'conceptNames',
    'sizes',
    'categoryName',
    'barcodes',
    // Останнім: правило attribute ставить споріднені після точних збігів
    'relatedNames',
  ],
  filterableAttributes: [
    'id',
    'categorySlug',
    'concepts',
    'chains',
    'countries',
    'promoChains',
    'promoCountries',
    'chainsCount',
    'lineId',
    'indexedAt',
  ],
  sortableAttributes: ['chainsCount', 'minPrice'],
  // Стандартні правила, а за рівних — товари, що є в більшій кількості мереж
  rankingRules: [
    'words',
    'typo',
    'proximity',
    'attribute',
    'sort',
    'exactness',
    'chainsCount:desc',
  ],
  synonyms: SYNONYMS,
  // "coka" → "coca": помилка вже в слові з 4 літер (за замовчуванням — з 5)
  typoTolerance: { minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
};

export interface IndexedProduct {
  id: string;
  name: string;
  lineId: string | null;
  brand: { name: string } | null;
  category: { slug: string; name: string } | null;
  variants: {
    label: string;
    barcodes: { gtin: string }[];
    listings: {
      currentPrice: unknown;
      isOnPromo?: boolean;
      /** Немає в наявності — мережа лишається у фільтрі, але ціна не рахується */
      inStock?: boolean;
      /** Давно не бачена ціна не бере участі в мінімальній, якщо є свіжіші */
      lastSeenAt?: Date;
      chain: { slug: string; currency: string; countryCode: string };
    }[];
  }[];
}

export function toSearchDoc(
  product: IndexedProduct,
  indexedAt: number,
): SearchDoc {
  const listings = product.variants
    .flatMap((v) => v.listings)
    .filter((l) => l.currentPrice !== null);
  // Ціна в основній валюті (₴), якщо товар продається в Україні
  const currency = listings.some((l) => l.chain.currency === 'UAH')
    ? 'UAH'
    : (listings[0]?.chain.currency ?? null);
  const prices = freshOrAll(
    listings.filter(
      (l) => l.chain.currency === currency && l.inStock !== false,
    ),
    new Date(indexedAt),
  ).map((l) => Number(l.currentPrice));
  const chains = [...new Set(listings.map((l) => l.chain.slug))];
  const promos = listings.filter((l) => l.isOnPromo && l.inStock !== false);
  const concept = conceptOf(product.name, product.category?.slug);
  const terms = concept ? conceptTerms(concept) : { names: [], related: [] };
  return {
    id: product.id,
    name: product.name,
    nameLatin: transliterate(fold(product.name)),
    brand: product.brand?.name ?? null,
    sizes: [...new Set(product.variants.map((v) => v.label))].join(' '),
    categorySlug: product.category?.slug ?? null,
    categoryName: product.category?.name ?? null,
    concepts: concept ? conceptPath(concept) : [],
    conceptNames: terms.names,
    relatedNames: terms.related,
    lineId: product.lineId,
    chains,
    countries: [...new Set(listings.map((l) => l.chain.countryCode))],
    promoChains: [...new Set(promos.map((l) => l.chain.slug))],
    promoCountries: [...new Set(promos.map((l) => l.chain.countryCode))],
    chainsCount: chains.length,
    barcodes: product.variants.flatMap((v) => v.barcodes.map((b) => b.gtin)),
    minPrice: prices.length ? Math.min(...prices) : null,
    currency,
    indexedAt,
  };
}

/** Фільтр Meilisearch (умови через AND); значення — у лапках JSON, без ін'єкції в синтаксис */
export function searchFilter(f: {
  category?: string;
  chain?: string;
  country?: string;
  minChains?: number;
  onPromo?: boolean;
  excludeId?: string;
  excludeLineId?: string | null;
}): string[] {
  const q = JSON.stringify;
  return [
    f.category && `categorySlug = ${q(f.category)}`,
    f.chain && `chains = ${q(f.chain)}`,
    f.country && `countries = ${q(f.country)}`,
    f.minChains && f.minChains > 1 && `chainsCount >= ${f.minChains}`,
    f.onPromo &&
      (f.chain ? `promoChains = ${q(f.chain)}` : 'promoChains IS NOT EMPTY'),
    f.onPromo && f.country && `promoCountries = ${q(f.country)}`,
    f.excludeId && `id != ${q(f.excludeId)}`,
    f.excludeLineId && `lineId != ${q(f.excludeLineId)}`,
  ].filter((c): c is string => !!c);
}

/** "Напій газований Coca-Cola" без бренду "Coca-Cola" → "Напій газований" (запит для аналогів) */
export function withoutBrand(
  name: string,
  brand: string | null | undefined,
): string {
  if (!brand) return name;
  const brandWords = new Set([fold(brand), ...fold(brand).split(/[\s-]+/)]);
  const rest = name
    .split(/\s+/)
    .filter(
      (w) =>
        !brandWords.has(fold(w)) &&
        !brandWords.has(fold(w).replace(/[^\p{L}\p{N}]/gu, '')),
    );
  return rest.length ? rest.join(' ') : name;
}

export const searchEnabled = () => !!process.env.MEILI_URL;

export async function meili<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 3000,
): Promise<T> {
  const key = process.env.MEILI_MASTER_KEY;
  const response = await fetch(`${process.env.MEILI_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(key && { Authorization: `Bearer ${key}` }),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok)
    throw new Error(`Meilisearch ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

type Strategy = 'all' | 'last';

/**
 * id товарів за запитом (у порядку релевантності), оцінка релевантності Meilisearch (0..1) і
 * оцінка кількості. Спершу всі слова запиту ("молоко галичина" — лише молоко Галичини);
 * нічого не знайшлось — м'якше, без останніх слів. Запит, що називає поняття (`concept`:
 * "молоко", "Milch"), спершу шукає лише серед товарів цього поняття всіма мовами — без
 * солодощів "Milch-Mäuse" і без спорідненого кефіру; порожньо — так само без фільтра поняття.
 * `first` (умова фільтра, напр. країна покупця) — її товари йдуть першими, далі решта;
 * сторінки проходять крізь обидві частини.
 */
export async function searchProductIds(
  q: string,
  filter: string[],
  offset: number,
  limit: number,
  strategies: Strategy[] = ['all', 'last'],
  concept: string | null = null,
  first: string | null = null,
): Promise<{ ids: string[]; scores: number[]; total: number }> {
  const conceptFilter = concept && [
    ...filter,
    `concepts = ${JSON.stringify(concept)}`,
  ];
  const attempts = strategies.flatMap((strategy) =>
    conceptFilter
      ? [
          { strategy, filter: conceptFilter },
          { strategy, filter },
        ]
      : [{ strategy, filter }],
  );
  const search = (
    matchingStrategy: Strategy,
    filter: string[],
    offset: number,
    limit: number,
  ) =>
    meili<{
      hits: { id: string; _rankingScore?: number }[];
      estimatedTotalHits: number;
    }>(`/indexes/${PRODUCTS_INDEX}/search`, {
      method: 'POST',
      body: JSON.stringify({
        q,
        filter,
        offset,
        limit,
        matchingStrategy,
        attributesToRetrieve: ['id'],
        showRankingScore: true,
      }),
    });
  let found = { ids: [] as string[], scores: [] as number[], total: 0 };
  for (const { strategy, filter } of attempts) {
    let hits: { id: string; _rankingScore?: number }[];
    let total: number;
    if (first) {
      const head = await search(strategy, [...filter, first], offset, limit);
      const tail = await search(
        strategy,
        [...filter, `NOT (${first})`],
        Math.max(0, offset - head.estimatedTotalHits),
        limit - head.hits.length,
      );
      hits = [...head.hits, ...tail.hits];
      total = head.estimatedTotalHits + tail.estimatedTotalHits;
    } else {
      ({ hits, estimatedTotalHits: total } = await search(
        strategy,
        filter,
        offset,
        limit,
      ));
    }
    found = {
      ids: hits.map((h) => h.id),
      scores: hits.map((h) => h._rankingScore ?? 0),
      total,
    };
    if (found.total > 0) break;
  }
  return found;
}

import { occasionConcepts, parseQuery } from '@repo/matching';

/**
 * Що пошук робить із розібраним запитом (PRD-21, етап 1): ціна, нагода й категорія стають
 * фільтрами, "дешеве" — сортуванням, решта слів — текстом. `null` — у запиті немає нічого,
 * крім слів: пошук іде як раніше, без розбору.
 */
export interface SearchIntent {
  /** Текст для пошуку: запит без вилучених фраз; для кількох понять порожній */
  text: string;
  /** Єдине поняття запиту: пошук спершу обмежується ним, а потім послаблюється */
  concept: string | null;
  /** Кілька понять чи нагода: товар має мати одне з них (предок охоплює нащадків) */
  concepts: string[];
  categories: string[];
  maxPrice?: number;
  minPrice?: number;
  currency?: 'UAH' | 'EUR';
  /** Сортування Meilisearch: "priceUah:asc" */
  sort: string[];
}

export function searchIntent(
  query: string,
  country?: string,
): SearchIntent | null {
  const parsed = parseQuery(query);
  const priced = parsed.maxPrice !== undefined || parsed.minPrice !== undefined;
  const several = parsed.concepts.length > 1;
  if (
    !priced &&
    !several &&
    !parsed.occasion &&
    !parsed.sort &&
    !parsed.categories.length
  )
    return null;

  const concept = parsed.concepts.length === 1 ? parsed.concepts[0] : null;
  const concepts = several
    ? parsed.concepts
    : !concept && parsed.occasion
      ? [...occasionConcepts(parsed.occasion)]
      : [];
  const currency = parsed.currency ?? (country === 'DE' ? 'EUR' : 'UAH');
  return {
    text: several ? '' : parsed.text,
    concept,
    concepts,
    categories: parsed.categories,
    maxPrice: parsed.maxPrice,
    minPrice: parsed.minPrice,
    currency: parsed.currency,
    sort: parsed.sort
      ? [currency === 'EUR' ? 'priceEur:asc' : 'priceUah:asc']
      : [],
  };
}

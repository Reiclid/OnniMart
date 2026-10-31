import type { VariationsSnapshot } from '@repo/contracts';
import { fold, isLearned, tokenize } from '@repo/matching';

/**
 * /admin/variations без БД: вивчені слова (знімок воркера) + ручні рішення модераторів.
 *   learned   — вивчене з даних, діє;
 *   added     — додане вручну, діє з вагою 1;
 *   removed   — вимкнене вручну, не діє;
 *   candidate — є контраст, але замало для порогів (не діє).
 */
export type WordStatus = 'learned' | 'added' | 'removed' | 'candidate';
export const WORD_STATUSES: WordStatus[] = [
  'learned',
  'added',
  'removed',
  'candidate',
];
/** Фільтр списку: статус або всі слова, що діють зараз (learned + added) */
export type WordFilter = WordStatus | 'active' | 'all';
export type WordSort = 'products' | 'contrast' | 'weight' | 'word';

export interface WordRow {
  word: string;
  status: WordStatus;
  /** Чи впливає слово на зіставлення зараз */
  active: boolean;
  contrast: number;
  noise: number;
  /** null — слова немає в знімку (додане вручну, даних про нього нема) */
  weight: number | null;
  note: string | null;
  listings: number;
  products: number;
}

export interface OverrideRow {
  word: string;
  action: 'ADD' | 'REMOVE';
  note: string | null;
}

/** Злиття знімка воркера з ручними рішеннями; ручне рішення важливіше */
export function mergeWords(
  snapshot: VariationsSnapshot | null,
  overrides: OverrideRow[],
): Omit<WordRow, 'listings' | 'products'>[] {
  const rules = snapshot ?? { minContrast: 2, minWeight: 0.75 };
  const byWord = new Map(overrides.map((o) => [o.word, o]));
  const rows: Omit<WordRow, 'listings' | 'products'>[] = [];
  for (const w of snapshot?.words ?? []) {
    const override = byWord.get(w.word);
    byWord.delete(w.word);
    const learned = isLearned(w, rules);
    const status: WordStatus = override
      ? override.action === 'ADD'
        ? 'added'
        : 'removed'
      : learned
        ? 'learned'
        : 'candidate';
    rows.push({
      word: w.word,
      status,
      active: status === 'learned' || status === 'added',
      contrast: w.contrast,
      noise: w.noise,
      weight: w.weight,
      note: override?.note ?? null,
    });
  }
  // Ручні рішення про слова без контрасту в даних
  for (const o of byWord.values()) {
    rows.push({
      word: o.word,
      status: o.action === 'ADD' ? 'added' : 'removed',
      active: o.action === 'ADD',
      contrast: 0,
      noise: 0,
      weight: null,
      note: o.note,
    });
  }
  return rows;
}

export function matchesFilter(
  row: { status: WordStatus; active: boolean; word: string },
  filter: WordFilter,
  search: string,
): boolean {
  if (filter === 'active' && !row.active) return false;
  if (filter !== 'active' && filter !== 'all' && row.status !== filter) {
    return false;
  }
  return !search || row.word.includes(search);
}

export function sortWords(rows: WordRow[], sort: WordSort): WordRow[] {
  const by: Record<WordSort, (a: WordRow, b: WordRow) => number> = {
    products: (a, b) => b.products - a.products || b.listings - a.listings,
    contrast: (a, b) => b.contrast - a.contrast,
    weight: (a, b) => (b.weight ?? 2) - (a.weight ?? 2),
    word: () => 0,
  };
  return [...rows].sort(
    (a, b) => by[sort](a, b) || a.word.localeCompare(b.word),
  );
}

/**
 * Слово так, як його бачить зіставлення (listings.nameTokens): "Stracciatella" →
 * "stracciatella", "Куркою" → "куркою". null — не одне слово або число.
 */
export function normalizeWord(input: string): string | null {
  const tokens = tokenize(input.trim());
  if (tokens.length !== 1 || /\d/.test(tokens[0].norm)) return null;
  return tokens[0].norm;
}

/** Пошук у списку: так само без регістру й діакритики, як слова */
export function normalizeSearch(input: string | undefined): string {
  return input ? fold(input.trim()) : '';
}

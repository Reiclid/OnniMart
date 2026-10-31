import type { VariationsSnapshot } from '@repo/contracts';
import {
  matchesFilter,
  mergeWords,
  normalizeSearch,
  normalizeWord,
  sortWords,
  WordRow,
} from './variation-words';

const SNAPSHOT: VariationsSnapshot = {
  builtAt: '2026-10-31T10:00:00.000Z',
  minContrast: 2,
  minWeight: 0.75,
  words: [
    { word: 'erdbeere', contrast: 82, noise: 0, weight: 1 },
    { word: 'becher', contrast: 2, noise: 3, weight: 0.4 },
    { word: 'mini', contrast: 5, noise: 1, weight: 5 / 6 },
  ],
};

describe('mergeWords', () => {
  it('вивчене, кандидат, вимкнене вручну і додане без даних', () => {
    const rows = mergeWords(SNAPSHOT, [
      { word: 'mini', action: 'REMOVE', note: 'уточнення' },
      { word: 'stracciatella', action: 'ADD', note: null },
    ]);
    const byWord = new Map(rows.map((r) => [r.word, r]));
    expect(byWord.get('erdbeere')).toMatchObject({
      status: 'learned',
      active: true,
    });
    expect(byWord.get('becher')).toMatchObject({
      status: 'candidate',
      active: false,
    });
    expect(byWord.get('mini')).toMatchObject({
      status: 'removed',
      active: false,
      note: 'уточнення',
      contrast: 5,
    });
    expect(byWord.get('stracciatella')).toMatchObject({
      status: 'added',
      active: true,
      weight: null,
    });
  });

  it('ручне ADD для кандидата робить його діючим', () => {
    const [becher] = mergeWords(SNAPSHOT, [
      { word: 'becher', action: 'ADD', note: null },
    ]).filter((r) => r.word === 'becher');
    expect(becher).toMatchObject({ status: 'added', active: true });
  });

  it('без знімка воркера — лише ручні рішення', () => {
    expect(
      mergeWords(null, [{ word: 'gouda', action: 'ADD', note: null }]),
    ).toHaveLength(1);
  });
});

describe('matchesFilter', () => {
  const row = { word: 'erdbeere', status: 'learned' as const, active: true };
  it('за статусом, діючими і пошуком', () => {
    expect(matchesFilter(row, 'active', '')).toBe(true);
    expect(matchesFilter(row, 'learned', 'erd')).toBe(true);
    expect(matchesFilter(row, 'removed', '')).toBe(false);
    expect(matchesFilter(row, 'all', 'vanille')).toBe(false);
  });
});

describe('sortWords', () => {
  const row = (word: string, products: number, contrast: number): WordRow => ({
    word,
    products,
    contrast,
    listings: products,
    status: 'learned',
    active: true,
    noise: 0,
    weight: 1,
    note: null,
  });
  it('за товарами, контрастом, абеткою', () => {
    const rows = [row('b', 1, 9), row('a', 5, 1), row('c', 5, 3)];
    expect(sortWords(rows, 'products').map((r) => r.word)).toEqual([
      'a',
      'c',
      'b',
    ]);
    expect(sortWords(rows, 'contrast')[0].word).toBe('b');
    expect(sortWords(rows, 'word').map((r) => r.word)).toEqual(['a', 'b', 'c']);
  });
});

describe('normalizeWord', () => {
  it('як у nameTokens: регістр, діакритика, гомогліфи', () => {
    expect(normalizeWord(' Stracciatella ')).toBe('stracciatella');
    expect(normalizeWord('Käse')).toBe('kase');
    expect(normalizeWord('Куркою')).toBe('куркою');
  });
  it('не одне слово або число — null', () => {
    expect(normalizeWord('erdbeere vanille')).toBeNull();
    expect(normalizeWord('1664')).toBeNull();
    expect(normalizeWord('  ')).toBeNull();
  });
  it('пошук нормалізується так само', () => {
    expect(normalizeSearch('Käse')).toBe('kase');
    expect(normalizeSearch(undefined)).toBe('');
  });
});

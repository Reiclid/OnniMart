import { affinity, buildProfile, emptyProfile, topKeys } from './profile';
import { rankForYou, rankSearch } from './rerank';
import { cheapness, featuresOf, score, WEIGHTS, type Candidate } from './score';

const now = new Date('2026-10-25T12:00:00Z');
const daysAgo = (d: number) =>
  new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

const item = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  relevance: 0,
  category: 'dairy',
  concept: null,
  brand: null,
  line: null,
  chains: ['silpo'],
  discount: 0,
  unitPrices: {},
  inCountry: true,
  ...over,
});

describe('buildProfile', () => {
  it('сильніша дія важить більше, стара згасає з τ = 30 днів', () => {
    const p = buildProfile(
      [
        { type: 'track', at: now, concept: 'milk' },
        { type: 'view', at: now, concept: 'bread' },
        { type: 'track', at: daysAgo(30), concept: 'kefir' },
      ],
      now,
    );
    expect(p.concept.get('milk')).toBe(8);
    expect(p.concept.get('bread')).toBe(1);
    expect(p.concept.get('kefir')).toBeCloseTo(8 / Math.E);
    expect(topKeys(p.concept, 2)).toEqual(['milk', 'kefir']);
  });

  it('мережі з налаштувань не згасають; схильність нормована до 0..1', () => {
    const p = buildProfile(
      [{ type: 'chain_click', at: daysAgo(60), chains: ['novus'] }],
      now,
      ['silpo'],
    );
    expect(affinity(p.chain, 'silpo')).toBe(1);
    expect(affinity(p.chain, 'novus')).toBeCloseTo((3 * Math.exp(-2)) / 8);
    expect(affinity(p.chain, 'atb')).toBe(0);
    expect(affinity(emptyProfile().brand, 'x')).toBe(0);
  });
});

describe('cheapness', () => {
  it('дешевше за одиницю в тій самій категорії й валюті — вище, одинак — 0', () => {
    const cheap = cheapness([
      item('a', { unitPrices: { UAH: 0.04 } }),
      item('b', { unitPrices: { UAH: 0.06 } }),
      item('c', { unitPrices: { UAH: 0.08 } }),
      item('d', { category: 'drinks', unitPrices: { EUR: 0.002 } }),
      item('e'),
    ]);
    expect(cheap.get('a')!).toBeGreaterThan(0);
    expect(cheap.get('c')!).toBeLessThan(0);
    expect(cheap.get('d')).toBe(0);
    expect(cheap.get('e')).toBe(0);
  });
});

describe('score', () => {
  it('сума внесків ознак — видно, що підняло товар', () => {
    const p = buildProfile([{ type: 'track', at: now, concept: 'milk' }], now);
    const f = featuresOf(
      item('a', { concept: 'milk', chains: ['silpo', 'novus'] }),
      p,
      {
        maxChains: 2,
        cheap: new Map(),
      },
    );
    const { score: s, contributions } = score(f, WEIGHTS.forYou);
    expect(f.popularity).toBe(1);
    expect(contributions.concept).toBe(0.4);
    expect(s).toBeCloseTo(0.3 + 0.4);
  });
});

describe('rankSearch', () => {
  it('релевантність головна, схильність розводить сусідні позиції', () => {
    const p = buildProfile(
      [{ type: 'track', at: now, brand: 'Галичина' }],
      now,
    );
    const ids = rankSearch(
      [
        item('first', { relevance: 1 }),
        item('second', { relevance: 0.99 }),
        item('liked', { relevance: 0.98, brand: 'Галичина' }),
        item('far', { relevance: 0.2, brand: 'Галичина' }),
      ],
      p,
    );
    expect(ids).toEqual(['liked', 'first', 'second', 'far']);
  });

  it('товари вибраних мереж — першими, далі за оцінкою', () => {
    const ids = rankSearch(
      [
        item('best', { relevance: 1, chains: ['silpo'] }),
        item('mine', { relevance: 0.5, chains: ['novus', 'auchan'] }),
        item('mine-too', { relevance: 0.6, chains: ['auchan'] }),
      ],
      emptyProfile(),
      ['auchan'],
    );
    expect(ids).toEqual(['mine-too', 'mine', 'best']);
  });

  it('вибрані мережі, далі своя країна, далі решта країн', () => {
    const ids = rankSearch(
      [
        item('abroad', { relevance: 1, chains: ['silpo'], inCountry: false }),
        item('home', { relevance: 0.3, chains: ['penny'], inCountry: true }),
        item('mine', { relevance: 0.2, chains: ['lidl-de'], inCountry: true }),
      ],
      emptyProfile(),
      ['lidl-de'],
    );
    expect(ids).toEqual(['mine', 'home', 'abroad']);
  });

  it('без профілю й ознак — порядок базового пошуку', () => {
    const ids = rankSearch(
      [item('a', { relevance: 1 }), item('b', { relevance: 1 })],
      emptyProfile(),
    );
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('rankForYou', () => {
  const profile = buildProfile(
    [
      { type: 'track', at: now, category: 'dairy', concept: 'milk' },
      { type: 'view', at: now, category: 'bakery', concept: 'bread' },
    ],
    now,
  );

  it('лише країна користувача, без підписаного, не більше двох з лінійки', () => {
    const { ids } = rankForYou(
      [
        item('m1', { concept: 'milk', line: 'L' }),
        item('m2', { concept: 'milk', line: 'L' }),
        item('m3', { concept: 'milk', line: 'L' }),
        item('foreign', { concept: 'milk', inCountry: false }),
        item('tracked', { concept: 'milk' }),
        item('bread', { category: 'bakery', concept: 'bread' }),
      ],
      profile,
      { limit: 5, exclude: new Set(['tracked']) },
    );
    expect(ids.sort()).toEqual(['bread', 'm1', 'm2']);
  });

  it('штраф категорії перемішує полиці з близькою схильністю', () => {
    const close = buildProfile(
      [
        { type: 'track', at: now, category: 'dairy', concept: 'milk' },
        { type: 'favourite', at: now, category: 'bakery', concept: 'bread' },
      ],
      now,
    );
    const { ids } = rankForYou(
      [
        item('m1', { concept: 'milk' }),
        item('m2', { concept: 'milk' }),
        item('m3', { concept: 'milk' }),
        item('bread', { category: 'bakery', concept: 'bread' }),
      ],
      close,
      { limit: 3 },
    );
    expect(ids).toEqual(['m1', 'm2', 'bread']);
  });

  it('10 % слотів — випадковий товар з решти, позначений як дослідження', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      item(`p${i}`, { concept: i < 15 ? 'milk' : null }),
    );
    const { ids, explored } = rankForYou(many, profile, {
      limit: 10,
      random: () => 0.99,
    });
    expect(ids).toHaveLength(10);
    expect([...explored]).toEqual(['p29']);
    expect(ids[9]).toBe('p29');
    expect(new Set(ids).size).toBe(10);
  });
});

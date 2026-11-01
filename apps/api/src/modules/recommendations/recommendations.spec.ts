import {
  toCandidates,
  toSignals,
  type ProductFacts,
  rankedPoolKey,
} from './recommendations';

const facts = (id: string, over: Partial<ProductFacts> = {}): ProductFacts => ({
  id,
  name: 'Молоко Галичина 2,5% 900 г',
  lineId: 'line',
  brandId: 'brand',
  category: 'dairy',
  chains: ['silpo'],
  countries: ['UA'],
  discount: 0,
  ...over,
});

describe('toCandidates', () => {
  it('релевантність за позицією, поняття з назви, ціни за валютами, країна', () => {
    const [a, b, gone] = toCandidates(
      ['a', 'b', 'gone'],
      [facts('a'), facts('b', { countries: ['DE'], discount: 0.2 })],
      [
        { id: 'a', currency: 'UAH', price: 0.05 },
        { id: 'a', currency: 'EUR', price: 0.001 },
      ],
      'UA',
    );
    expect(a).toMatchObject({
      relevance: 1,
      concept: 'milk',
      unitPrices: { UAH: 0.05, EUR: 0.001 },
      inCountry: true,
    });
    expect(b).toMatchObject({
      relevance: 1 - 1 / 3,
      discount: 0.2,
      inCountry: false,
    });
    expect(gone).toMatchObject({
      chains: [],
      unitPrices: {},
      inCountry: false,
    });
  });

  it('оцінка Meilisearch замість позиції', () => {
    const [a, b] = toCandidates(['a', 'b'], [], [], null, [0.9, 0.85]);
    expect([a.relevance, b.relevance]).toEqual([0.9, 0.85]);
  });

  it('країна невідома — підходить усе', () => {
    const [b] = toCandidates(
      ['b'],
      [facts('b', { countries: ['DE'] })],
      [],
      null,
    );
    expect(b.inCountry).toBe(true);
  });
});

describe('toSignals', () => {
  it('дія успадковує категорію, поняття й бренд товару; chain_click — лише мережу', () => {
    const at = new Date();
    const products = new Map([
      [
        'p',
        {
          name: 'Хліб Київхліб Український',
          brandId: 'kh',
          category: 'bakery',
        },
      ],
    ]);
    expect(
      toSignals(
        [
          { type: 'track', at, productId: 'p', chains: ['silpo'] },
          { type: 'chain_click', at, chains: ['novus'] },
        ],
        products,
      ),
    ).toEqual([
      {
        type: 'track',
        at,
        chains: ['silpo'],
        category: 'bakery',
        concept: 'bread',
        brand: 'kh',
      },
      {
        type: 'chain_click',
        at,
        chains: ['novus'],
        category: undefined,
        concept: null,
        brand: undefined,
      },
    ]);
  });
});

describe('rankedPoolKey', () => {
  it('сторінки одного пошуку — один пул; інший запит, фільтр чи сесія — інший', () => {
    const key = rankedPoolKey('s1', { q: ' Cola ', country: 'UA' }, 24);
    expect(rankedPoolKey('s1', { q: 'cola', country: 'UA' }, 24)).toBe(key);
    expect(rankedPoolKey('s1', { q: 'fanta', country: 'UA' }, 24)).not.toBe(
      key,
    );
    expect(
      rankedPoolKey('s1', { q: 'cola', country: 'UA', category: 'drinks' }, 24),
    ).not.toBe(key);
    expect(rankedPoolKey('s2', { q: 'cola', country: 'UA' }, 24)).not.toBe(key);
    expect(rankedPoolKey('s1', { q: 'cola', country: 'UA' }, 48)).not.toBe(key);
  });
});

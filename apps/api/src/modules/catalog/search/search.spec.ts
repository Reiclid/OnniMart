import { searchFilter, toSearchDoc, withoutBrand } from './search';

const listing = (slug: string, currency: string, price: number | null) => ({
  currentPrice: price,
  chain: { slug, currency, countryCode: currency === 'EUR' ? 'DE' : 'UA' },
});

describe('toSearchDoc', () => {
  it('латинська назва, фасування, мережі й мінімальна ціна в гривнях', () => {
    const doc = toSearchDoc(
      {
        id: 'p1',
        name: 'Вода мінеральна Моршинська',
        lineId: 'l1',
        brand: { name: 'Моршинська' },
        category: { slug: 'drinks', name: 'Drinks' },
        variants: [
          {
            label: '1,5 л',
            barcodes: [{ gtin: '04820017000277' }],
            listings: [
              listing('novus', 'UAH', 25),
              listing('eko', 'UAH', 21.7),
            ],
          },
          {
            label: '0,5 л',
            barcodes: [],
            listings: [
              listing('aldi-sued', 'EUR', 0.39),
              listing('silpo', 'UAH', null),
            ],
          },
        ],
      },
      42,
    );
    expect(doc).toMatchObject({
      nameLatin: 'voda mineralna morshynska',
      sizes: '1,5 л 0,5 л',
      categorySlug: 'drinks',
      chains: ['novus', 'eko', 'aldi-sued'],
      countries: ['UA', 'DE'],
      chainsCount: 3,
      barcodes: ['04820017000277'],
      minPrice: 21.7,
      currency: 'UAH',
      indexedAt: 42,
    });
  });

  it('ціна того, чого немає в наявності, не мінімальна, але мережа лишається', () => {
    const doc = toSearchDoc(
      {
        id: 'p',
        name: 'Cola',
        lineId: null,
        brand: null,
        category: null,
        variants: [
          {
            label: '1 л',
            barcodes: [],
            listings: [
              { ...listing('eko', 'UAH', 19), inStock: false },
              listing('novus', 'UAH', 25),
            ],
          },
        ],
      },
      1,
    );
    expect(doc).toMatchObject({ minPrice: 25, chains: ['eko', 'novus'] });
  });

  it('стара ціна не стає мінімальною, поки є свіжіша', () => {
    const at = new Date('2026-11-07T00:00:00Z');
    const doc = toSearchDoc(
      {
        id: 'p',
        name: 'Cola',
        lineId: null,
        brand: null,
        category: null,
        variants: [
          {
            label: '1 л',
            barcodes: [],
            listings: [
              {
                ...listing('eko', 'UAH', 19),
                lastSeenAt: new Date('2026-10-01T00:00:00Z'),
              },
              { ...listing('novus', 'UAH', 25), lastSeenAt: at },
            ],
          },
        ],
      },
      at.getTime(),
    );
    expect(doc).toMatchObject({ minPrice: 25, chains: ['eko', 'novus'] });
  });

  it('лише німецькі мережі — ціна в євро; без цін — null', () => {
    const base = {
      id: 'p',
      name: 'Cola',
      lineId: null,
      brand: null,
      category: null,
    };
    expect(
      toSearchDoc(
        {
          ...base,
          variants: [
            {
              label: '1 l',
              barcodes: [],
              listings: [listing('aldi-sued', 'EUR', 1.59)],
            },
          ],
        },
        1,
      ),
    ).toMatchObject({ minPrice: 1.59, currency: 'EUR' });
    expect(toSearchDoc({ ...base, variants: [] }, 1)).toMatchObject({
      minPrice: null,
      currency: null,
      chainsCount: 0,
    });
  });

  it('поняття: назви всіма мовами і споріднені (PRD-19)', () => {
    const doc = toSearchDoc(
      {
        id: 'p',
        name: 'Roggenbrot',
        lineId: null,
        brand: null,
        category: { slug: 'bakery', name: 'Bakery' },
        variants: [],
      },
      1,
    );
    expect(doc.concepts).toEqual(['bread', 'bakery']);
    expect(doc.conceptNames).toEqual(
      expect.arrayContaining(['хліб', 'Brot', 'bread', 'випічка']),
    );
    expect(doc.relatedNames).toEqual(expect.arrayContaining(['круасан']));
    expect(
      toSearchDoc(
        {
          id: 'p',
          name: 'Тарілки',
          lineId: null,
          brand: null,
          category: null,
          variants: [],
        },
        1,
      ),
    ).toMatchObject({ concepts: [], conceptNames: [], relatedNames: [] });
  });
});

describe('searchFilter', () => {
  it('умови в лапках, порожні пропускаються', () => {
    expect(
      searchFilter({
        category: 'drinks',
        chain: 'novus',
        country: 'DE',
        minChains: 2,
        excludeId: 'p1',
        excludeLineId: 'l1',
      }),
    ).toEqual([
      'categorySlug = "drinks"',
      'chains = "novus"',
      'countries = "DE"',
      'chainsCount >= 2',
      'id != "p1"',
      'lineId != "l1"',
    ]);
    expect(searchFilter({ minChains: 1, excludeLineId: null })).toEqual([]);
    // лапки в значенні не ламають синтаксис фільтра
    expect(searchFilter({ chain: 'a" OR id = "x' })).toEqual([
      'chains = "a\\" OR id = \\"x"',
    ]);
  });

  it('акції: будь-де, у вибраній мережі або в країні', () => {
    expect(searchFilter({ onPromo: true })).toEqual([
      'promoChains IS NOT EMPTY',
    ]);
    expect(searchFilter({ onPromo: true, chain: 'novus' })).toEqual([
      'chains = "novus"',
      'promoChains = "novus"',
    ]);
    expect(searchFilter({ onPromo: true, country: 'UA' })).toEqual([
      'countries = "UA"',
      'promoChains IS NOT EMPTY',
      'promoCountries = "UA"',
    ]);
    expect(searchFilter({ onPromo: false, chain: 'novus' })).toEqual([
      'chains = "novus"',
    ]);
  });
});

describe('toSearchDoc: акції', () => {
  it('лише акції в наявності, окремо мережі й країни', () => {
    const product = (
      slug: string,
      countryCode: string,
      isOnPromo: boolean,
      inStock = true,
    ) => ({
      currentPrice: 10,
      isOnPromo,
      inStock,
      chain: { slug, currency: 'UAH', countryCode },
    });
    const doc = toSearchDoc(
      {
        id: 'p1',
        name: 'Вода',
        lineId: null,
        brand: null,
        category: null,
        variants: [
          {
            label: '1 л',
            barcodes: [],
            listings: [
              product('novus', 'UA', true),
              product('silpo', 'UA', false),
              product('lidl-de', 'DE', true, false),
            ],
          },
        ],
      },
      1,
    );
    expect(doc.promoChains).toEqual(['novus']);
    expect(doc.promoCountries).toEqual(['UA']);
  });
});

describe('withoutBrand', () => {
  it('прибирає слова бренду; без бренду або лише бренд — назва як є', () => {
    expect(withoutBrand('Напій газований Coca-Cola', 'Coca-Cola')).toBe(
      'Напій газований',
    );
    expect(
      withoutBrand('Вода мінеральна Моршинська негазована', 'Моршинська'),
    ).toBe('Вода мінеральна негазована');
    expect(withoutBrand('Milka', 'Milka')).toBe('Milka');
    expect(withoutBrand('Cola Light', null)).toBe('Cola Light');
  });
});

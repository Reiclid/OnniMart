import {
  columnIndex,
  fromOffProduct,
  isRelevantSuggestion,
  offCode,
  parseOffRow,
  suggestionQueries,
} from './food-facts';

const HEADER = [
  'code',
  'last_modified_t',
  'product_name',
  'labels_tags',
  'categories_tags',
  'ingredients_text',
  'ingredients_analysis_tags',
  'allergens_en',
  'nutriscore_grade',
  'nova_group',
  'energy-kcal_100g',
  'fat_100g',
  'sugars_100g',
  'salt_100g',
].join('\t');
const columns = columnIndex(HEADER);
const row = (cells: string[]) => cells.join('\t');

describe('parseOffRow', () => {
  const cola = row([
    '5449000000996',
    '1792588304',
    'Coca-Cola Original',
    'en:made-in-the-eu,fr:triman',
    'en:beverages,en:sodas,en:colas',
    'Wasser, Zucker, Kohlensäure',
    'en:vegan,en:palm-oil-free',
    'Caffeine',
    'E',
    '4',
    '42.4',
    '0',
    '10.6',
    '',
  ]);

  it('наш штрихкод → запис з нормалізованим gtin і харчовою цінністю', () => {
    expect(parseOffRow(cola, columns, new Set(['05449000000996']))).toEqual({
      gtin: '05449000000996',
      productName: 'Coca-Cola Original',
      brands: [],
      quantity: null,
      imageUrl: null,
      ingredients: 'Wasser, Zucker, Kohlensäure',
      allergens: ['caffeine'],
      labels: ['en:made-in-the-eu', 'fr:triman'],
      categories: ['en:beverages', 'en:sodas', 'en:colas'],
      analysis: ['en:vegan', 'en:palm-oil-free'],
      // Порожня сіль — не 0, а невідомо
      nutriments: { energyKcal: 42.4, fat: 0, sugars: 10.6 },
      nutriscore: 'e',
      nova: 4,
      offModifiedAt: new Date(1792588304 * 1000),
    });
  });

  it('чужі й некоректні коди пропускає', () => {
    expect(parseOffRow(cola, columns, new Set(['04820017000277']))).toBeNull();
    expect(
      parseOffRow(
        row(['5449000000997', ...Array(13).fill('')]),
        columns,
        new Set(['05449000000997']),
      ),
    ).toBeNull();
  });

  it('невідомі значення — null, а не сміття', () => {
    const empty = parseOffRow(
      row([
        '5449000000996',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'unknown',
        'x',
        '',
        '',
        '',
        '',
      ]),
      columns,
      new Set(['05449000000996']),
    );
    expect(empty).toMatchObject({
      nutriscore: null,
      nova: null,
      nutriments: null,
      offModifiedAt: null,
      allergens: [],
    });
  });

  it('файл без стовпця code — помилка', () => {
    expect(() => columnIndex('name\tbrand')).toThrow('code');
  });
});

describe('Open Food Facts API і сканер', () => {
  it('відповідь API v2 → запис food_facts', () => {
    const row = fromOffProduct('00000042141204', {
      product_name: 'Mineralwasser',
      brands: 'Quellbrunn, Altmühltaler Quelle (Aldi Süd)',
      quantity: '1.5l',
      image_front_small_url: 'https://images.openfoodfacts.org/x.jpg',
      categories_tags: ['en:waters', 'en:mineral-waters'],
      nutriscore_grade: 'a',
      nutriments: { 'energy-kcal_100g': 0, salt_100g: 0.01 },
    });
    expect(row).toMatchObject({
      gtin: '00000042141204',
      productName: 'Mineralwasser',
      brands: ['Quellbrunn', 'Altmühltaler Quelle (Aldi Süd)'],
      quantity: '1.5l',
      imageUrl: 'https://images.openfoodfacts.org/x.jpg',
      categories: ['en:waters', 'en:mineral-waters'],
      nutriscore: 'a',
      nutriments: { energyKcal: 0, salt: 0.01 },
      nova: null,
    });
  });

  it('код для OFF — як на етикетці', () => {
    expect(offCode('00000042141204')).toBe('42141204');
    expect(offCode('05449000000996')).toBe('5449000000996');
    expect(offCode('10012345678902')).toBe('10012345678902');
  });

  it('запити для схожих: бренд + назва, бренд, назва; без дужок і повторів', () => {
    expect(
      suggestionQueries({
        productName: 'Mineralwasser',
        brands: ['Quellbrunn', 'Altmühltaler Quelle (Aldi Süd)'],
      }),
    ).toEqual([
      'Quellbrunn Mineralwasser',
      'Altmühltaler Quelle Mineralwasser',
      'Quellbrunn',
      'Altmühltaler Quelle',
      'Mineralwasser',
    ]);
    expect(suggestionQueries({ productName: null, brands: [] })).toEqual([]);
  });
});

describe('isRelevantSuggestion', () => {
  const water = {
    productName: 'Mineralwasser',
    brands: ['Milbona', 'Quellbrunn'],
  };
  it('спільне слово з назвою OFF, а не лише бренд', () => {
    expect(
      isRelevantSuggestion(water, {
        name: 'Mineralwasser, Medium',
        brand: 'Globus',
      }),
    ).toBe(true);
    expect(
      isRelevantSuggestion(water, { name: 'Skyr Natur', brand: 'Milbona' }),
    ).toBe(false);
  });
  it('без назви — за брендом', () => {
    const facts = { productName: null, brands: ['Quellbrunn'] };
    expect(
      isRelevantSuggestion(facts, { name: 'Aqua', brand: 'QUELLBRUNN' }),
    ).toBe(true);
    expect(isRelevantSuggestion(facts, { name: 'Aqua', brand: null })).toBe(
      false,
    );
  });
});

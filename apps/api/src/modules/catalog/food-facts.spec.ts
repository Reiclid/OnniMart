import { columnIndex, parseOffRow } from './food-facts';

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

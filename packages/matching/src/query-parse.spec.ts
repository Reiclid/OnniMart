import { CONCEPTS } from './concepts';
import {
  OCCASIONS,
  occasionConcepts,
  parseQuery,
  type ParsedQuery,
} from './query-parse';

const UAH = { currency: 'UAH' } as const;
const EUR = { currency: 'EUR' } as const;

/** Запит → очікуваний розбір (відсутні поля: поняття й категорії порожні, текст порожній) */
const QUERIES: [string, Partial<ParsedQuery>][] = [
  // ── ціна: українська ────────────────────────────────────────────────────
  ['до 1 євро', { maxPrice: 1, ...EUR }],
  ['дешевше 50 грн', { maxPrice: 50, ...UAH }],
  ['до 100 гривень', { maxPrice: 100, ...UAH }],
  ['не дорожче 30 грн', { maxPrice: 30, ...UAH }],
  ['менше 20 ₴', { maxPrice: 20, ...UAH }],
  ['до 2€', { maxPrice: 2, ...EUR }],
  ['до 1,5 євро', { maxPrice: 1.5, ...EUR }],
  [
    'печиво до 1.5 євро',
    { concepts: ['cookies'], text: 'печиво', maxPrice: 1.5, ...EUR },
  ],
  [
    'молоко до 40 грн',
    { concepts: ['milk'], text: 'молоко', maxPrice: 40, ...UAH },
  ],
  [
    'хліб дешевше за 25 грн',
    { concepts: ['bread'], text: 'хліб', maxPrice: 25, ...UAH },
  ],
  [
    'сир до 100 гривень',
    { concepts: ['cheese'], text: 'сир', maxPrice: 100, ...UAH },
  ],
  [
    'кава не дорожче 200 грн',
    { concepts: ['coffee'], text: 'кава', maxPrice: 200, ...UAH },
  ],
  [
    'шоколад milka до 2 євро',
    { concepts: ['chocolate'], text: 'шоколад milka', maxPrice: 2, ...EUR },
  ],
  [
    'вода 1.5 л до 30 грн',
    { concepts: ['water'], text: 'вода 1.5 л', maxPrice: 30, ...UAH },
  ],
  [
    'масло вершкове не більше 90 грн',
    { concepts: ['butter'], text: 'масло вершкове', maxPrice: 90, ...UAH },
  ],
  ['від 20 до 50 грн', { minPrice: 20, maxPrice: 50, ...UAH }],
  ['від 30 грн', { minPrice: 30, ...UAH }],
  ['дорожче 100 грн', { minPrice: 100, ...UAH }],
  // ціна без валюти або вага — не ціна
  ['до 2 кг', { text: 'до 2 кг' }],
  ['молоко 2,5%', { concepts: ['milk'], text: 'молоко 2,5%' }],
  ['до 50', { text: 'до 50' }],
  ['не більше 5 штук', { text: 'не більше 5 штук' }],

  // ── ціна: німецька ──────────────────────────────────────────────────────
  ['unter 2 €', { maxPrice: 2, ...EUR }],
  [
    'unter 2 € Käse',
    { concepts: ['cheese'], text: 'käse', maxPrice: 2, ...EUR },
  ],
  ['bis 5 Euro', { maxPrice: 5, ...EUR }],
  ['günstiger als 3 Euro', { maxPrice: 3, ...EUR }],
  ['weniger als 2 €', { maxPrice: 2, ...EUR }],
  ['höchstens 4 EUR', { maxPrice: 4, ...EUR }],
  ['max 10 €', { maxPrice: 10, ...EUR }],
  ['max. 10 €', { maxPrice: 10, ...EUR }],
  [
    'Milch unter 1 Euro',
    { concepts: ['milk'], text: 'milch', maxPrice: 1, ...EUR },
  ],
  [
    'Brot unter 2,50 €',
    { concepts: ['bread'], text: 'brot', maxPrice: 2.5, ...EUR },
  ],
  [
    'Wein bis 8 Euro',
    { concepts: ['wine'], text: 'wein', maxPrice: 8, ...EUR },
  ],
  ['ab 5 Euro', { minPrice: 5, ...EUR }],
  ['mindestens 3 €', { minPrice: 3, ...EUR }],
  ['zwischen 2 und 5 Euro', { minPrice: 2, maxPrice: 5, ...EUR }],
  ['unter 2 kg', { text: 'unter 2 kg' }],
  [
    'Nudeln unter 1 € pro Packung',
    { concepts: ['pasta'], text: 'nudeln pro packung', maxPrice: 1, ...EUR },
  ],

  // ── ціна: англійська ────────────────────────────────────────────────────
  ['under 2 euros', { maxPrice: 2, ...EUR }],
  ['under €2', { maxPrice: 2, ...EUR }],
  ['below 3 eur', { maxPrice: 3, ...EUR }],
  ['less than 50 uah', { maxPrice: 50, ...UAH }],
  ['cheaper than 2 €', { maxPrice: 2, ...EUR }],
  ['up to 10 eur', { maxPrice: 10, ...EUR }],
  ['max 5 eur', { maxPrice: 5, ...EUR }],
  [
    'milk under 1 euro',
    { concepts: ['milk'], text: 'milk', maxPrice: 1, ...EUR },
  ],
  [
    'bread under 2 euros',
    { concepts: ['bread'], text: 'bread', maxPrice: 2, ...EUR },
  ],
  [
    'cheese up to 3 €',
    { concepts: ['cheese'], text: 'cheese', maxPrice: 3, ...EUR },
  ],
  ['from 5 euros', { minPrice: 5, ...EUR }],
  ['over 10 eur', { minPrice: 10, ...EUR }],
  ['between 2 and 5 euros', { minPrice: 2, maxPrice: 5, ...EUR }],
  ['under 5 dollars', { text: 'under 5 dollars' }],
  ['under 5', { text: 'under 5' }],

  // ── «дешеве» → сортування ───────────────────────────────────────────────
  ['дешеве молоко', { concepts: ['milk'], text: 'молоко', sort: 'price-asc' }],
  ['найдешевше пиво', { concepts: ['beer'], text: 'пиво', sort: 'price-asc' }],
  ['недорогий сир', { concepts: ['cheese'], text: 'сир', sort: 'price-asc' }],
  ['бюджетна кава', { concepts: ['coffee'], text: 'кава', sort: 'price-asc' }],
  ['günstiger Käse', { concepts: ['cheese'], text: 'käse', sort: 'price-asc' }],
  [
    'billige Nudeln',
    { concepts: ['pasta'], text: 'nudeln', sort: 'price-asc' },
  ],
  ['cheap wine', { concepts: ['wine'], text: 'wine', sort: 'price-asc' }],
  [
    'cheapest coffee',
    { concepts: ['coffee'], text: 'coffee', sort: 'price-asc' },
  ],
  [
    'дешеве молоко до 40 грн',
    {
      concepts: ['milk'],
      text: 'молоко',
      sort: 'price-asc',
      maxPrice: 40,
      ...UAH,
    },
  ],

  // ── нагоди ──────────────────────────────────────────────────────────────
  ['до пива', { occasion: 'beer' }],
  ['під пиво', { occasion: 'beer' }],
  ['закуски до пива', { occasion: 'beer' }],
  ['що купити до пива', { occasion: 'beer' }],
  ['zum Bier', { occasion: 'beer' }],
  ['snacks for beer', { occasion: 'beer' }],
  ['beer snacks', { occasion: 'beer' }],
  ['до вина', { occasion: 'wine' }],
  ['zum Wein', { occasion: 'wine' }],
  ['with wine', { occasion: 'wine' }],
  ['до чаю', { occasion: 'tea' }],
  ['zum Tee', { occasion: 'tea' }],
  ['до кави', { occasion: 'coffee' }],
  ['zum Kaffee', { occasion: 'coffee' }],
  ['на сніданок', { occasion: 'breakfast' }],
  ['що купити на сніданок', { occasion: 'breakfast' }],
  ['zum Frühstück', { occasion: 'breakfast' }],
  ['for breakfast', { occasion: 'breakfast' }],
  ['breakfast', { occasion: 'breakfast' }],
  ['на обід', { occasion: 'lunch' }],
  ['zum Mittagessen', { occasion: 'lunch' }],
  ['на вечерю', { occasion: 'dinner' }],
  ['zum Abendessen', { occasion: 'dinner' }],
  ['for dinner', { occasion: 'dinner' }],
  ['на шашлик', { occasion: 'barbecue' }],
  ['zum Grillen', { occasion: 'barbecue' }],
  ['for bbq', { occasion: 'barbecue' }],
  ['на вечірку', { occasion: 'party' }],
  ['für die Party', { occasion: 'party' }],
  ['party', { occasion: 'party' }],
  ['на пікнік', { occasion: 'picnic' }],
  ['picnic', { occasion: 'picnic' }],
  ['на десерт', { occasion: 'dessert' }],
  ['zum Nachtisch', { occasion: 'dessert' }],
  ['до фільму', { occasion: 'movie' }],
  ['movie night', { occasion: 'movie' }],
  ['Filmabend', { occasion: 'movie' }],
  ['на бутерброди', { occasion: 'sandwich' }],
  ['на день народження', { occasion: 'birthday' }],
  ['zum Geburtstag', { occasion: 'birthday' }],

  // ── нагода + поняття + ціна ─────────────────────────────────────────────
  ['сир до вина', { concepts: ['cheese'], text: 'сир', occasion: 'wine' }],
  [
    'ковбаса на шашлик',
    { concepts: ['sausage'], text: 'ковбаса', occasion: 'barbecue' },
  ],
  [
    'печиво до чаю до 50 грн',
    {
      concepts: ['cookies'],
      text: 'печиво',
      occasion: 'tea',
      maxPrice: 50,
      ...UAH,
    },
  ],
  [
    'Käse zum Wein unter 5 €',
    {
      concepts: ['cheese'],
      text: 'käse',
      occasion: 'wine',
      maxPrice: 5,
      ...EUR,
    },
  ],
  [
    'something for breakfast under 3 euros',
    { occasion: 'breakfast', maxPrice: 3, ...EUR },
  ],
  ['щось до пива дешевше 100 грн', { occasion: 'beer', maxPrice: 100, ...UAH }],
  ['дешеві закуски до пива', { occasion: 'beer', sort: 'price-asc' }],
  ['на сніданок до 2 євро', { occasion: 'breakfast', maxPrice: 2, ...EUR }],

  // ── кілька понять ───────────────────────────────────────────────────────
  ['молоко і хліб', { concepts: ['milk', 'bread'], text: 'молоко і хліб' }],
  ['Milch und Brot', { concepts: ['milk', 'bread'], text: 'milch und brot' }],
  [
    'milk, bread and cheese',
    { concepts: ['milk', 'bread', 'cheese'], text: 'milk, bread and cheese' },
  ],
  ['сир, ковбаса', { concepts: ['cheese', 'sausage'], text: 'сир, ковбаса' }],
  ['молоко галичина', { concepts: ['milk'], text: 'молоко галичина' }],
  ['хліб з маслом', { concepts: ['bread'], text: 'хліб з маслом' }],
  ['кава з молоком', { concepts: ['coffee'], text: 'кава з молоком' }],
  [
    'Joghurt mit Erdbeeren',
    { concepts: ['yogurt'], text: 'joghurt mit erdbeeren' },
  ],
  ['bio milch', { concepts: ['milk'], text: 'bio milch' }],
  [
    'молоко і хліб до 60 грн',
    {
      concepts: ['milk', 'bread'],
      text: 'молоко і хліб',
      maxPrice: 60,
      ...UAH,
    },
  ],

  // ── дієта ───────────────────────────────────────────────────────────────
  [
    'веганський сир',
    { concepts: ['cheese'], text: 'веганський сир', diet: 'vegan' },
  ],
  [
    'безлактозне молоко',
    { concepts: ['milk'], text: 'безлактозне молоко', diet: 'lactose-free' },
  ],
  [
    'laktosefreie Milch',
    { concepts: ['milk'], text: 'laktosefreie milch', diet: 'lactose-free' },
  ],
  [
    'lactose free milk',
    { concepts: ['milk'], text: 'lactose free milk', diet: 'lactose-free' },
  ],
  [
    'glutenfreies Brot',
    { concepts: ['bread'], text: 'glutenfreies brot', diet: 'gluten-free' },
  ],
  [
    'без глютену макарони',
    { concepts: ['pasta'], text: 'без глютену макарони', diet: 'gluten-free' },
  ],
  [
    'sugar free chocolate',
    {
      concepts: ['chocolate'],
      text: 'sugar free chocolate',
      diet: 'sugar-free',
    },
  ],
  [
    'шоколад без цукру',
    { concepts: ['chocolate'], text: 'шоколад без цукру', diet: 'sugar-free' },
  ],
  [
    'zuckerfreie Schokolade',
    {
      concepts: ['chocolate'],
      text: 'zuckerfreie schokolade',
      diet: 'sugar-free',
    },
  ],
  [
    'vegetarische Wurst',
    { concepts: ['sausage'], text: 'vegetarische wurst', diet: 'vegetarian' },
  ],
  [
    'вегетаріанська піца',
    { concepts: ['pizza'], text: 'вегетаріанська піца', diet: 'vegetarian' },
  ],
  [
    'vegan pizza до 5 €',
    {
      concepts: ['pizza'],
      text: 'vegan pizza',
      diet: 'vegan',
      maxPrice: 5,
      ...EUR,
    },
  ],

  // ── категорії без поняття ───────────────────────────────────────────────
  [
    'заморожена піца',
    { categories: ['frozen'], concepts: ['pizza'], text: 'піца' },
  ],
  [
    'frozen pizza',
    { categories: ['frozen'], concepts: ['pizza'], text: 'pizza' },
  ],
  [
    'Tiefkühlpizza',
    { categories: ['frozen'], concepts: ['pizza'], text: 'pizza' },
  ],
  [
    'заморожені овочі',
    { categories: ['frozen'], concepts: ['vegetables'], text: 'овочі' },
  ],
  ['готові страви', { categories: ['ready-meals'] }],
  ['Fertiggerichte', { categories: ['ready-meals'] }],
  ['побутова хімія', { categories: ['household'] }],
  ['Haushaltswaren', { categories: ['household'] }],
  ['косметика', { categories: ['beauty'] }],
  ['Kosmetik', { categories: ['beauty'] }],
  ['beauty', { categories: ['beauty'] }],
  ['товари для тварин', { categories: ['pets'] }],
  ['Tierbedarf', { categories: ['pets'] }],
  ['дитяче харчування', { categories: ['baby'] }],
  ['Babyprodukte', { categories: ['baby'] }],
  ['бакалія', { categories: ['pantry'] }],
  [
    'заморожені продукти до 100 грн',
    { categories: ['frozen'], maxPrice: 100, ...UAH },
  ],

  // ── звичайні запити лишаються текстом ──────────────────────────────────
  ['молоко', { concepts: ['milk'], text: 'молоко' }],
  ['Milch', { concepts: ['milk'], text: 'milch' }],
  ['bread', { concepts: ['bread'], text: 'bread' }],
  ['Моршинська', { text: 'моршинська' }],
  ['Milka', { text: 'milka' }],
  ['4820000123456', { text: '4820000123456' }],
  ['вода', { concepts: ['water'], text: 'вода' }],
  ['Wasser', { concepts: ['water'], text: 'wasser' }],
  ['', {}],
  ['   ', {}],
];

describe('parseQuery', () => {
  it('набір запитів: 100+ розборів', () => {
    expect(QUERIES.length).toBeGreaterThanOrEqual(100);
  });

  it.each(QUERIES)('%s', (query, expected) => {
    expect(parseQuery(query)).toEqual({
      concepts: [],
      categories: [],
      text: '',
      ...expected,
    });
  });

  it('регістр і зайві пробіли не мають значення', () => {
    expect(parseQuery('  ДО   1  ЄВРО ')).toEqual(parseQuery('до 1 євро'));
    expect(parseQuery('UNTER 2 €')).toEqual(parseQuery('unter 2 €'));
  });

  it('ціна завжди додатна', () => {
    expect(parseQuery('до 0 грн').maxPrice).toBeUndefined();
  });
});

describe('нагоди', () => {
  const slugs = new Set(CONCEPTS.map((c) => c.slug));

  it('кожна нагода складається з наявних понять', () => {
    for (const [occasion, concepts] of Object.entries(OCCASIONS)) {
      expect(concepts.length).toBeGreaterThan(1);
      for (const slug of concepts)
        expect(slugs.has(slug) ? slug : `${occasion}: ${slug}?`).toBe(slug);
    }
  });

  it('occasionConcepts', () => {
    expect(occasionConcepts('beer')).toEqual(OCCASIONS.beer);
    expect(occasionConcepts('breakfast')).toContain('yogurt');
  });
});

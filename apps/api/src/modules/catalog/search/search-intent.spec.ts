import { searchIntent } from './search-intent';

describe('searchIntent', () => {
  it('звичайні запити — без розбору', () => {
    expect(searchIntent('молоко')).toBeNull();
    expect(searchIntent('молоко галичина')).toBeNull();
    expect(searchIntent('Milka')).toBeNull();
    expect(searchIntent('безлактозне молоко')).toBeNull();
    expect(searchIntent('до 2 кг')).toBeNull();
  });

  it('ціна: текст, поняття, межа й валюта', () => {
    expect(searchIntent('молоко до 40 грн')).toEqual({
      text: 'молоко',
      concept: 'milk',
      concepts: [],
      categories: [],
      maxPrice: 40,
      minPrice: undefined,
      currency: 'UAH',
      sort: [],
    });
    expect(searchIntent('Käse unter 2 €')).toMatchObject({
      text: 'käse',
      concept: 'cheese',
      maxPrice: 2,
      currency: 'EUR',
    });
  });

  it('нагода без понять — набір понять нагоди, текст порожній', () => {
    expect(searchIntent('що купити до пива')).toMatchObject({
      text: '',
      concept: null,
      concepts: ['snacks', 'cheese'],
    });
  });

  it('нагода з поняттям — поняття, а не весь набір', () => {
    expect(searchIntent('сир до вина')).toMatchObject({
      text: 'сир',
      concept: 'cheese',
      concepts: [],
    });
  });

  it('кілька понять — фільтр за будь-яким, без тексту', () => {
    expect(searchIntent('молоко і хліб до 60 грн')).toMatchObject({
      text: '',
      concept: null,
      concepts: ['milk', 'bread'],
      maxPrice: 60,
    });
  });

  it('"дешеве" сортує за ціною у валюті запиту чи країни', () => {
    expect(searchIntent('дешеве молоко')?.sort).toEqual(['priceUah:asc']);
    expect(searchIntent('günstige Milch', 'DE')?.sort).toEqual([
      'priceEur:asc',
    ]);
    expect(searchIntent('cheap milk до 2 євро', 'UA')?.sort).toEqual([
      'priceEur:asc',
    ]);
  });

  it('категорія без поняття', () => {
    expect(searchIntent('заморожена піца')).toMatchObject({
      text: 'піца',
      concept: 'pizza',
      categories: ['frozen'],
    });
  });
});

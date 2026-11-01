import { querySuggestions, rememberQuery, topCategory } from './suggestions';

const NAMES = [
  'Galychyna UHT Milk 2.5% 950 g',
  'Yagotynske Milk 2.6% 900 g',
  'Milka Alpine Milk Chocolate 90 g',
  'Roshen Milk Chocolate 90 g',
  'Prostokvashino Milk 3.2% 870 g',
];

describe('querySuggestions', () => {
  it('доповнює останнє слово й додає наступне, найчастіші першими', () => {
    expect(querySuggestions('mil', NAMES)).toEqual(['milk', 'milk chocolate', 'milka']);
  });

  it('кілька слів: повні мають збігтися, останнє — початком', () => {
    expect(querySuggestions('milk ch', NAMES)).toEqual(['milk chocolate']);
  });

  it('коротко або сам запит — нічого', () => {
    expect(querySuggestions('m', NAMES)).toEqual([]);
    expect(querySuggestions('roshen milk chocolate', NAMES)).toEqual([]);
  });
});

describe('topCategory', () => {
  it('найчастіша категорія, якщо в неї хоча б два товари', () => {
    expect(topCategory([{ name: 'a', category: 'dairy-eggs' }, { name: 'b', category: 'sweets' }, { name: 'c', category: 'dairy-eggs' }])).toBe('dairy-eggs');
    expect(topCategory([{ name: 'a', category: 'dairy-eggs' }, { name: 'b', category: null }])).toBeNull();
  });
});

describe('rememberQuery', () => {
  it('новий запит першим, без повторів і порожніх, до 5', () => {
    expect(rememberQuery(['milk', 'coffee'], ' Milk ')).toEqual(['Milk', 'coffee']);
    expect(rememberQuery(['a'], '  ')).toEqual(['a']);
    expect(rememberQuery(['1', '2', '3', '4', '5'], 'new')).toEqual(['new', '1', '2', '3', '4']);
  });
});

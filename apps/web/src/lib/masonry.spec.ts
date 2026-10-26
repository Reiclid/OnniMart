import { estimateCardHeight, masonryColumns, nameLines } from './masonry';

describe('masonryColumns', () => {
  it('кожна картка йде в нижчу колонку, при рівних — у ліву', () => {
    // 1-ша висока ліворуч, тоді 2-га й 3-тя праворуч, поки права не наздожене
    expect(masonryColumns([300, 100, 100, 100])).toEqual([[0], [1, 2, 3]]);
    expect(masonryColumns([100, 100, 100, 100])).toEqual([[0, 2], [1, 3]]);
  });

  it('довантаження не переставляє вже розкладені картки', () => {
    const first = masonryColumns([250, 229, 229, 250]);
    const more = masonryColumns([250, 229, 229, 250, 229, 229]);
    first.forEach((col, c) => expect(more[c].slice(0, col.length)).toEqual(col));
  });
});

describe('estimateCardHeight', () => {
  it('довга назва — на рядок вища; без ціни й підпису — нижча', () => {
    const short = estimateCardHeight({ name: 'Coca-Cola 0,5 л', price: 30, caption: 'Cheapest at NOVUS' });
    const long = estimateCardHeight({ name: 'Coca-Cola Original Taste 1,25 л', price: 30, caption: 'Cheapest at NOVUS' });
    expect(long - short).toBe(21);
    expect(estimateCardHeight({ name: 'Coca-Cola 0,5 л', price: null, caption: '' })).toBeLessThan(short);
  });
});

describe('nameLines', () => {
  it('переносить за словами, не більше 2 рядків', () => {
    expect(nameLines('Cola Classic / Zero')).toBe(1);
    expect(nameLines('Dessert Butterkeks & Vanille')).toBe(2);
    expect(nameLines('Milka Schokolade Alpenmilch mit Haselnuss 100 g')).toBe(2);
  });
});

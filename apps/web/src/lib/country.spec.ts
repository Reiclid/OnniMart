import { convertPrice, countryFromLanguages, displayCurrency, shownPrice, isCountry, localFirst, parseInterests } from './country';

describe('countryFromLanguages', () => {
  it('регіон мови визначає країну', () => {
    expect(countryFromLanguages('de-DE,de;q=0.9,en;q=0.8')).toBe('DE');
    expect(countryFromLanguages('en-GB,uk-UA;q=0.8')).toBe('UA');
    expect(countryFromLanguages('en-US,de-DE;q=0.7')).toBe('DE');
  });
  it('мова без регіону: de → Німеччина, uk → Україна', () => {
    expect(countryFromLanguages('de')).toBe('DE');
    expect(countryFromLanguages('uk,en')).toBe('UA');
  });
  it('невідоме або порожнє — Україна', () => {
    expect(countryFromLanguages('fr-FR')).toBe('UA');
    expect(countryFromLanguages(null)).toBe('UA');
  });
});

it('isCountry приймає лише країни з мережами', () => {
  expect(isCountry('DE')).toBe(true);
  expect(isCountry('FR')).toBe(false);
  expect(isCountry('toString')).toBe(false);
});

it('parseInterests відкидає чуже й повтори', () => {
  expect(parseInterests('drinks.dairy-eggs.drinks.<x>.A')).toEqual(['drinks', 'dairy-eggs']);
  expect(parseInterests(undefined)).toEqual([]);
});

it('localFirst ставить валюту країни першою', () => {
  const prices = [{ currency: 'UAH', min: 50 }, { currency: 'EUR', min: 1.2 }];
  expect(localFirst(prices, 'DE').map((p) => p.currency)).toEqual(['EUR', 'UAH']);
  expect(localFirst(prices, 'UA').map((p) => p.currency)).toEqual(['UAH', 'EUR']);
});

describe('convertPrice', () => {
  const perEur = { EUR: 1, UAH: 50.5766, PLN: 4.3945 };

  it('перераховує через EUR і округлює до копійок', () => {
    expect(convertPrice(1.99, 'EUR', 'UAH', perEur)).toBe(100.65);
    expect(convertPrice(61.9, 'UAH', 'EUR', perEur)).toBe(1.22);
    expect(convertPrice(10, 'PLN', 'UAH', perEur)).toBe(115.09);
  });

  it('та сама валюта — без змін, навіть без курсів', () => {
    expect(convertPrice(42.5, 'UAH', 'UAH', null)).toBe(42.5);
  });

  it('немає курсу — null', () => {
    expect(convertPrice(1, 'EUR', 'UAH', null)).toBeNull();
    expect(convertPrice(1, 'GBP', 'UAH', perEur)).toBeNull();
  });
});

describe('displayCurrency', () => {
  it('вибір покупця важливіший за країну', () => {
    expect(displayCurrency('UA', 'USD')).toBe('USD');
    expect(displayCurrency('DE', 'UAH')).toBe('UAH');
  });

  it('без вибору чи з чужим значенням — валюта країни', () => {
    expect(displayCurrency('UA', undefined)).toBe('UAH');
    expect(displayCurrency('DE', 'euro')).toBe('EUR');
  });
});

describe('shownPrice', () => {
  const perEur = { EUR: 1, UAH: 50.5766 };

  it('чужа валюта — головний цінник у валюті показу, справжня ціна окремо', () => {
    expect(shownPrice(1.59, 'EUR', { currency: 'UAH', perEur })).toEqual({
      value: 80.42,
      currency: 'UAH',
      original: { value: 1.59, currency: 'EUR' },
    });
  });

  it('та сама валюта, немає курсу чи контексту — ціна як є', () => {
    const native = { value: 69.3, currency: 'UAH', original: null };
    expect(shownPrice(69.3, 'UAH', { currency: 'UAH', perEur })).toEqual(native);
    expect(shownPrice(69.3, 'UAH', { currency: 'EUR', perEur: null })).toEqual(native);
    expect(shownPrice(69.3, 'UAH', undefined)).toEqual(native);
  });
});

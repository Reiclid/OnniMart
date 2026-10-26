/** Країна покупця й перший запуск (Figma 14–16 Onboarding): усе в cookie цього пристрою */

/** Країни, де є мережі; валюта — щоб картка показувала ціну саме тут */
export const COUNTRIES = { UA: { currency: 'UAH' }, DE: { currency: 'EUR' } } as const;
export type Country = keyof typeof COUNTRIES;

export const COUNTRY_COOKIE = 'onnimart_country';
/** Категорії з онбордингу (slug через `.`) — їх товари першими в «Popular» на головній */
export const INTERESTS_COOKIE = 'onnimart_interests';
/** Валюта показу (Figma 21), окремо від країни; немає cookie — валюта країни */
export const CURRENCY_COOKIE = 'onnimart_currency';
/** Популярні валюти — першими у виборі (Figma 21) */
export const POPULAR_CURRENCIES = ['UAH', 'EUR', 'USD', 'GBP', 'PLN'];
/** Онбординг пройдено або пропущено — більше не показуємо */
export const ONBOARDED_COOKIE = 'onnimart_onboarded';
export const ONBOARDING_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

const SLUG = /^[a-z0-9-]{2,40}$/;
export const MAX_INTERESTS = 8;

export const isCountry = (value: string | undefined): value is Country => !!value && Object.hasOwn(COUNTRIES, value);

/** Країна без вибору — з мов браузера: перша мова з регіоном або мова «de» → DE, інакше UA */
export function countryFromLanguages(acceptLanguage: string | null | undefined): Country {
  for (const part of (acceptLanguage ?? '').split(',')) {
    const [lang = '', region] = part.split(';')[0].trim().split('-');
    const code = region?.toUpperCase();
    if (isCountry(code)) return code;
    if (lang.toLowerCase() === 'de') return 'DE';
    if (lang.toLowerCase() === 'uk') return 'UA';
  }
  return 'UA';
}

/** Значення cookie → slug категорій; чуже відкидається */
export const parseInterests = (raw: string | undefined): string[] =>
  [...new Set((raw ?? '').split('.').filter((s) => SLUG.test(s)))].slice(0, MAX_INTERESTS);

/** Ціни картки: спершу у валюті країни, далі решта (товар може продаватися в кількох країнах) */
export function localFirst<T extends { currency: string }>(prices: T[], country: Country): T[] {
  const currency = COUNTRIES[country].currency;
  return [...prices.filter((p) => p.currency === currency), ...prices.filter((p) => p.currency !== currency)];
}

/** Курси за 1 EUR (`GET /api/v1/rates`: ЄЦБ + EUR/UAH від НБУ) */
export type PerEur = Record<string, number>;

/** Ціна в іншій валюті за курсом; null — курсу немає (тоді показуємо лише рідну ціну) */
export function convertPrice(value: number, from: string, to: string, perEur: PerEur | null): number | null {
  if (from === to) return value;
  const a = perEur?.[from];
  const b = perEur?.[to];
  return a && b ? Math.round((value / a) * b * 100) / 100 : null;
}

/** Країни з назвами мовою інтерфейсу — для карток вибору */
export function countryList(intlLocale: string): { code: Country; name: string }[] {
  const regions = new Intl.DisplayNames([intlLocale], { type: 'region' });
  return (Object.keys(COUNTRIES) as Country[]).map((code) => ({ code, name: regions.of(code) ?? code }));
}

/** Валюта, у якій показуємо перераховані ціни: вибір покупця (код ISO 4217) або валюта країни */
export const displayCurrency = (country: Country, saved: string | undefined): string =>
  saved && /^[A-Z]{3}$/.test(saved) ? saved : COUNTRIES[country].currency;

/** Валюта показу й курси — усе, що треба, щоб перерахувати цінник (серіалізується в клієнтські компоненти) */
export type Money = { currency: string; perEur: PerEur | null };

/**
 * Головний цінник у валюті показу; `original` — справжня ціна мережі в її валюті (для підцінника).
 * Та сама валюта або немає курсу — ціна як є, `original` = null.
 */
export function shownPrice(value: number, currency: string, money: Money | undefined) {
  const converted = money ? convertPrice(value, currency, money.currency, money.perEur) : null;
  return converted === null || currency === money?.currency
    ? { value, currency, original: null }
    : { value: converted, currency: money!.currency, original: { value, currency } };
}

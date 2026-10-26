import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, SESSION_COOKIE } from '@/api/custom-fetch';
import { getProducts, getProductsByIds } from '@/api/generated/catalog/catalog';
import { getMe, getMyProducts, getViews } from '@/api/generated/me/me';
import { getExchangeRates } from '@/api/generated/rates/rates';
import type { ExchangeRatesDto, GetProductsParams, ProductPageDto, ProductSummaryDto, UserDto } from '@/api/generated/model';
import { COUNTRY_COOKIE, countryFromLanguages, CURRENCY_COOKIE, displayCurrency, isCountry, localFirst, type Country, type Money } from './country';
import { CONSENT_COOKIE, parseConsent, parseViews, VIEWS_COOKIE } from './views';

/** Покупець поточного запиту або null (немає cookie чи сесія закінчилась) */
export async function currentUser(): Promise<UserDto | null> {
  if (!(await cookies()).has(SESSION_COOKIE)) return null;
  try {
    return (await getMe()).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** Для сторінок, де без входу нема чого показати */
export async function requireUser(next: string): Promise<UserDto> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/**
 * Країна запиту: cookie (вибір в онбордингу; після входу — з акаунта), інакше з мов браузера.
 * Каталог, пошук і акції показують лише товари мереж цієї країни.
 */
export async function currentCountry(): Promise<Country> {
  const saved = (await cookies()).get(COUNTRY_COOKIE)?.value;
  return isCountry(saved) ? saved : countryFromLanguages((await headers()).get('accept-language'));
}

let rates: { value: ExchangeRatesDto | null; until: number } | null = null;

/** Курси для перерахунку цін при показі; година в пам'яті сервера; API без курсів → null */
export async function exchangeRates(): Promise<ExchangeRatesDto | null> {
  if (rates && Date.now() < rates.until) return rates.value;
  const value = await getExchangeRates().then((r) => (r.status === 200 ? r.data : null), () => null);
  // Невдачу пам'ятаємо хвилину, щоб не питати API на кожен запит
  rates = { value, until: Date.now() + (value ? 60 : 1) * 60_000 };
  return value;
}

/** Валюта показу (Figma 21): вибір покупця, інакше валюта країни (`auto`) */
export async function currentCurrency(country: Country): Promise<{ currency: string; auto: boolean }> {
  const saved = (await cookies()).get(CURRENCY_COOKIE)?.value;
  const currency = displayCurrency(country, saved);
  return { currency, auto: saved !== currency };
}

/** Валюта показу з курсами — для цінників (ProductCard, ChainPriceRow) */
export async function currentMoney(country?: Country): Promise<Money> {
  const [{ currency }, rates] = await Promise.all([currentCurrency(country ?? (await currentCountry())), exchangeRates()]);
  return { currency, perEur: rates?.perEur ?? null };
}

/** Картки з ціною у валюті країни першою */
export const localized = (items: ProductSummaryDto[], country: Country) =>
  items.map((p) => ({ ...p, prices: localFirst(p.prices, country) }));

/** Каталог і пошук: покупець бачить порядок за своїм профілем (ранжувальник v0), гість — загальний */
export async function findProducts(params: GetProductsParams): Promise<ProductPageDto> {
  const country = await currentCountry();
  const query = { ...params, country };
  let page: ProductPageDto | null = null;
  if ((await cookies()).has(SESSION_COOKIE)) {
    try {
      page = (await getMyProducts(query)).data;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
  }
  page ??= (await getProducts(query)).data;
  return { ...page, items: localized(page.items, country) };
}

/** «Recently viewed», найновіші першими: покупця — з акаунта, гостя — з cookie цього пристрою */
export async function recentlyViewed(user: UserDto | null): Promise<ProductSummaryDto[]> {
  const country = await currentCountry();
  if (user) return localized((await getViews()).data, country);
  const ids = parseViews((await cookies()).get(VIEWS_COOKIE)?.value);
  if (ids.length === 0) return [];
  const { data } = await getProductsByIds({ ids });
  // Порядок — як у cookie; товари, що зникли з каталогу, пропускаються
  return localized(
    ids.flatMap((id) => data.find((p) => p.id === id) ?? []),
    country,
  );
}

/** Згода гостя на події (банер на головній); у покупця вона в акаунті */
export async function guestConsent() {
  return parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
}

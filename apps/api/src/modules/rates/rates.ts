/**
 * Курси валют з відкритих даних: ціни в БД лишаються в рідній валюті, перераховуються
 * лише при показі. База — EUR: денні курси ЄЦБ (≈30 валют) + EUR/UAH від НБУ,
 * бо ЄЦБ гривню не публікує.
 */

/** Redis: JSON `ExchangeRates`; пише воркер (`RatesUpdater`), читає API (`GET /api/v1/rates`) */
export const FX_RATES_KEY = 'fx:rates';

export const ECB_URL =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const NBU_URL =
  'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json';

/** ЄЦБ оновлює курси раз на робочий день (≈16:00 CET), НБУ — щодня; частіше не питаємо */
export const RATES_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface ExchangeRates {
  /** Дата курсів ЄЦБ (YYYY-MM-DD) */
  date: string;
  /** Скільки одиниць валюти за 1 EUR; EUR = 1 */
  perEur: Record<string, number>;
  fetchedAt: string;
}

/** Щоденний XML ЄЦБ → дата й курси за 1 EUR; null, якщо формат не той */
export function parseEcb(
  xml: string,
): { date: string; perEur: Record<string, number> } | null {
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  const perEur: Record<string, number> = {};
  for (const [, currency, rate] of xml.matchAll(
    /currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g,
  )) {
    const value = Number(rate);
    if (value > 0) perEur[currency] = value;
  }
  return date && perEur.USD ? { date, perEur } : null;
}

/** JSON НБУ (`valcode=EUR`) → гривень за 1 EUR; null, якщо формат не той */
export function parseNbuEur(json: unknown): number | null {
  if (!Array.isArray(json)) return null;
  const row: unknown = json.find(
    (r: unknown) => (r as { cc?: unknown } | null)?.cc === 'EUR',
  );
  const rate = (row as { rate?: unknown } | undefined)?.rate;
  return typeof rate === 'number' && rate > 0 ? rate : null;
}

/** Обидва джерела → курси за 1 EUR (разом з EUR = 1) */
export function mergeRates(
  ecb: { date: string; perEur: Record<string, number> },
  uahPerEur: number,
  now: Date,
): ExchangeRates {
  return {
    date: ecb.date,
    perEur: { ...ecb.perEur, EUR: 1, UAH: uahPerEur },
    fetchedAt: now.toISOString(),
  };
}

export const ratesStale = (
  rates: Pick<ExchangeRates, 'fetchedAt'> | null,
  now: Date,
): boolean =>
  !rates ||
  !(now.getTime() - new Date(rates.fetchedAt).getTime() < RATES_MAX_AGE_MS);

/** Збережене в Redis → курси; чуже чи зіпсоване → null */
export function parseStoredRates(raw: string | null): ExchangeRates | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ExchangeRates>;
    const ok =
      typeof value.date === 'string' &&
      typeof value.fetchedAt === 'string' &&
      typeof value.perEur === 'object' &&
      value.perEur !== null &&
      Object.values(value.perEur).every((v) => typeof v === 'number' && v > 0);
    return ok ? (value as ExchangeRates) : null;
  } catch {
    return null;
  }
}

/** Сума в іншій валюті через EUR, до копійок; null — курсу немає */
export function convert(
  value: number,
  from: string,
  to: string,
  perEur: Record<string, number> | null | undefined,
): number | null {
  if (from === to) return value;
  const a = perEur?.[from];
  const b = perEur?.[to];
  return a && b ? Math.round((value / a) * b * 100) / 100 : null;
}

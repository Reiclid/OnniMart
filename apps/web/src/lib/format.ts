import { shownPrice, type Money } from './country';

export function formatPrice(
  value: number | null | undefined,
  currency: string,
): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

export function formatDuration(start: string, end: string | null): string {
  if (!end) return '…';
  const seconds = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 1000,
  );
  if (seconds < 60) return `${seconds} с`;
  return `${Math.floor(seconds / 60)} хв ${seconds % 60} с`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('uk-UA').format(value);
}

/** "29,60–31,29 ₴" або "1,99 €", якщо ціна одна */
export function formatPriceRange(range: {
  currency: string;
  min: number;
  max: number;
}): string {
  if (range.min === range.max) return formatPrice(range.min, range.currency);
  return `${formatPrice(range.min, range.currency)} – ${formatPrice(range.max, range.currency)}`;
}

/** Схожість 0..1 у відсотках: 0.934 → "93 %" */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—';
  return `${Math.round(score * 100)} %`;
}

/** Вітрина (англійською): "61.90 ₴", "1.59 €" */
export function formatMoney(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currencySymbol(currency)}`;
}

/**
 * Цінник у валюті показу: "≈ 80.42 ₴" (перераховано за курсом) або "1.59 €" (рідна валюта);
 * `original` — справжня ціна мережі для підцінника, якщо перераховано.
 */
export function formatShown(value: number, currency: string, money: Money | undefined) {
  const shown = shownPrice(value, currency, money);
  return shown.original
    ? { text: `≈ ${formatMoney(shown.value, shown.currency)}`, original: formatMoney(shown.original.value, shown.original.currency) }
    : { text: formatMoney(value, currency), original: null };
}

/** "₴", "€"; `symbol` — однозначний ("A$", "CA$") для списку валют; невідома валюта — її код */
export const currencySymbol = (currency: string, display: 'narrowSymbol' | 'symbol' = 'narrowSymbol'): string =>
  new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: display })
    .formatToParts(0)
    .find((part) => part.type === 'currency')?.value ?? currency;

const UNITS: Record<string, string> = { л: 'L', кг: 'kg', шт: 'pc' };

/** "49.52 ₴/L" або null, якщо ціну за одиницю не пораховано; з `money` — у валюті показу, як головний цінник */
export function formatUnitPrice(
  offer: { unitPrice: number | null; unitLabel: string | null; currency: string },
  money?: Money,
): string | null {
  if (offer.unitPrice === null || !offer.unitLabel) return null;
  const unit = shownPrice(offer.unitPrice, offer.currency, money);
  return `${formatMoney(unit.value, unit.currency)}/${UNITS[offer.unitLabel] ?? offer.unitLabel}`;
}

/**
 * Заголовок товару: назва мережі починається з типу продукту ("Напій газований Coca-Cola Zero") — його
 * відокремлюємо, щоб заголовком був сам товар ("Coca-Cola Zero").
 * Бренду в назві немає або він на початку — назва як є, тип порожній. Перед брендом не лише слова
 * ("Карбонара + Coca-Cola", "2 x Coca-Cola") — це набір, а не тип: теж як є.
 */
export function splitProductName(name: string, brand: string | null): { kind: string | null; title: string } {
  const at = brand ? name.toLocaleLowerCase().indexOf(brand.toLocaleLowerCase()) : -1;
  const kind = name.slice(0, Math.max(at, 0)).trim();
  if (at <= 0 || !/^[\p{L}'’ -]+$/u.test(kind)) return { kind: null, title: name };
  return { kind, title: name.slice(at) };
}

/** Підпис різновиду в лінійці ("Zero", "банан"); якщо він не унікальний — повна назва */
export function lineChipLabel(
  product: { name: string; variantLabel: string | null },
  lineProducts: { variantLabel: string | null }[],
): string {
  return product.variantLabel &&
    lineProducts.filter((other) => other.variantLabel === product.variantLabel).length === 1
    ? product.variantLabel
    : product.name;
}

/** Скільки ще чекати (адмінка, українською): "< 1 хв", "~12 хв", "~1 год 20 хв" */
export function formatEta(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '< 1 хв';
  if (minutes < 60) return `~${minutes} хв`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `~${hours} год ${rest} хв` : `~${hours} год`;
}

/** Таймер до наступного обходу (адмінка): "04:05:09", "2 д 04:05:09"; минуле — "00:00:00" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const clock = [Math.floor(total / 3600) % 24, Math.floor(total / 60) % 60, total % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
  return days ? `${days} д ${clock}` : clock;
}

/** "12 хв тому": найбільша одиниця, якої вже набралось (для Intl.RelativeTimeFormat) */
export function relativeTime(iso: string, now: number): [number, Intl.RelativeTimeFormatUnit] {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86_400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return [Math.round(seconds / size), unit];
  return [0, 'minute'];
}

/** Частка шляху до цільової ціни (0–1) і скільки ще лишилось; ціль досягнута — 1 і 0 */
export function targetProgress(target: number, now: number): { progress: number; left: number } {
  if (now <= target) return { progress: 1, left: 0 };
  return { progress: target / now, left: Math.round((now - target) * 100) / 100 };
}

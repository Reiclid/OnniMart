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

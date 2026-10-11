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

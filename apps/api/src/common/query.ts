/** Розбір query-параметрів, які приходять рядками */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export function toInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** "true" / "1" / true */
export function isTrue(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

/** Decimal / рядок / число → число; null лишається null */
export function toNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** Номер сторінки ≥ 1 */
export function pageOf(value: unknown): number {
  return Math.max(toInt(value) ?? 1, 1);
}

/** Розмір сторінки 1..MAX_PAGE_SIZE */
export function clampPageSize(
  value: unknown,
  fallback = DEFAULT_PAGE_SIZE,
): number {
  return Math.min(Math.max(toInt(value) ?? fallback, 1), MAX_PAGE_SIZE);
}

/** Історія переглядів і події без БД: порядок, межі й термін зберігання — щоб перевірити тестами */
import type { EventType } from '../../generated/prisma/client';

/** "Нещодавно переглянуті": скільки товарів памʼятаємо на користувача */
export const MAX_VIEWS = 50;
/** Події зберігаються 180 днів (AUDIT §9.3) */
export const EVENT_RETENTION_DAYS = 180;

export const EVENT_TYPES = [
  'impression',
  'click',
  'view',
  'chain_click',
  'favourite',
  'track',
  'search',
  'filter',
] as const;

export type EventName = (typeof EVENT_TYPES)[number];

export function eventType(name: EventName): EventType {
  return name.toUpperCase() as EventType;
}

/**
 * Перегляди від найстарішого до найновішого (так їх шле веб, у т. ч. список гостя після входу):
 * повтор лишає лише останній, час зростає на 1 мс, щоб порядок у БД був однозначним.
 */
export function orderedViews(
  productIds: string[],
  now: Date,
): { productId: string; viewedAt: Date }[] {
  const latest = [...new Set([...productIds].reverse())]
    .slice(0, MAX_VIEWS)
    .reverse();
  return latest.map((productId, i) => ({
    productId,
    viewedAt: new Date(now.getTime() - (latest.length - 1 - i)),
  }));
}

export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

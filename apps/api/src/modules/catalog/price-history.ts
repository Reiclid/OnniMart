/**
 * PRD-02 статистика цін без БД. Історія — лише зміни (price_snapshots): знімок діє від
 * capturedAt до наступного знімка тієї самої картки.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Вікна графіка: 30 днів, 90 днів, рік */
export const HISTORY_WINDOWS = [30, 90, 365] as const;
export type HistoryWindow = (typeof HISTORY_WINDOWS)[number];
/** Omnibus: знижку порівнюють з найнижчою ціною за 30 днів до неї */
export const LOW_DAYS = 30;

export interface Snapshot {
  price: number;
  at: Date;
}

/** Картка мережі: знімки від найстаріших; перший може бути до початку вікна */
export interface ListingHistory {
  listingId: string;
  chainName: string;
  currency: string;
  snapshots: Snapshot[];
}

export interface CurrencyStats {
  currency: string;
  /** Найнижча поточна ціна серед мереж */
  current: number;
  /** Найнижча ціна в будь-якій мережі за останні 30 днів (разом із поточною) */
  low30: number;
  /** Середня поточна ціна серед мереж */
  average: number;
  /** Розкид між мережами: (найдорожча − найдешевша) / найдешевша, 0..∞ */
  spread: number;
  /**
   * Поточна найнижча ціна — найнижча вже стільки днів: відтоді ніде не було дешевше.
   * Якщо дешевше не було за всю історію — скільки днів історії є (lowerSeen = false)
   */
  lowestForDays: number;
  lowerSeen: boolean;
}

export function windowOf(days: number | undefined): HistoryWindow {
  return HISTORY_WINDOWS.find((w) => w === Number(days)) ?? 30;
}

/** Точки графіка у вікні: ціна на початок вікна, кожна зміна і поточна ціна «зараз» */
export function seriesPoints(
  snapshots: Snapshot[],
  from: Date,
  now: Date,
): Snapshot[] {
  const before = snapshots.filter((s) => s.at < from).at(-1);
  const inside = snapshots.filter((s) => s.at >= from && s.at <= now);
  const points = [
    ...(before ? [{ price: before.price, at: from }] : []),
    ...inside,
  ];
  const last = points.at(-1);
  return last && last.at < now
    ? [...points, { price: last.price, at: now }]
    : points;
}

/** Статистика по кожній валюті (ціни різних валют не порівнюються) */
export function priceStats(
  listings: ListingHistory[],
  now: Date,
): CurrencyStats[] {
  const byCurrency = new Map<string, ListingHistory[]>();
  for (const l of listings) {
    if (!l.snapshots.length) continue;
    byCurrency.set(l.currency, [...(byCurrency.get(l.currency) ?? []), l]);
  }
  const lowFrom = new Date(now.getTime() - LOW_DAYS * DAY_MS);
  return [...byCurrency].map(([currency, group]) => {
    const currents = group.map((l) => l.snapshots.at(-1)!.price);
    const current = Math.min(...currents);
    const max = Math.max(...currents);
    // Знімок, що діяв на початок 30 днів, теж у рахунку: ціна тоді вже була такою
    const low30 = Math.min(
      ...group.flatMap((l) =>
        seriesPoints(l.snapshots, lowFrom, now).map((p) => p.price),
      ),
    );
    // Коли востаннє десь діяла ціна, нижча за поточну найнижчу: до наступного знімка тієї картки
    let lowerUntil: Date | null = null;
    for (const l of group) {
      l.snapshots.forEach((s, i) => {
        if (s.price >= current) return;
        const until = l.snapshots[i + 1]?.at ?? now;
        if (!lowerUntil || until > lowerUntil) lowerUntil = until;
      });
    }
    const start = new Date(
      Math.min(...group.map((l) => l.snapshots[0].at.getTime())),
    );
    const since: Date = lowerUntil ?? start;
    return {
      currency,
      current,
      low30,
      average: round(currents.reduce((a, b) => a + b, 0) / currents.length),
      spread: round((max - current) / current),
      lowestForDays: Math.max(
        Math.floor((now.getTime() - since.getTime()) / DAY_MS),
        0,
      ),
      lowerSeen: lowerUntil !== null,
    };
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

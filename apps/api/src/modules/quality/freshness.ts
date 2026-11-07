/** AUD-05: свіжість даних по мережах (чисті правила, спільні для звіту, каталогу й сповіщень) */

const DAY = 24 * 60 * 60 * 1000;

export const FRESHNESS_LIMITS = {
  /** Картку не бачили довше — ціні вже не віримо */
  staleDays: 14,
  /** Повний обхід старший за це — мережа потребує уваги */
  crawlDays: 7,
  /** Повний обхід бачить меншу частку активних карток — зниклі не знімаються */
  delistShare: 0.5,
};

/** Картка без дати (старі дані в тестах) вважається свіжою */
export function isStale(lastSeenAt: Date | undefined, now: Date): boolean {
  return (
    lastSeenAt !== undefined &&
    now.getTime() - lastSeenAt.getTime() > FRESHNESS_LIMITS.staleDays * DAY
  );
}

/**
 * Пропозиції для «найдешевше»: лише свіжі, а якщо свіжих немає — усі. Інакше перерва
 * в обходах (або товар лише з чеків Open Prices) лишала б товар без жодної ціни.
 */
export function freshOrAll<T extends { lastSeenAt?: Date }>(
  listings: T[],
  now: Date,
): T[] {
  const fresh = listings.filter((l) => !isStale(l.lastSeenAt, now));
  return fresh.length ? fresh : listings;
}

export interface ChainFreshnessRow {
  chain: string;
  name: string;
  country: string;
  active: number;
  /** Активних карток, яких не бачили довше 2 і 7 днів */
  older2d: number;
  older7d: number;
  /** Активних карток, старших за FRESHNESS_LIMITS.staleDays */
  stale: number;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  /** Останній завершений повний обхід (із частковими) */
  lastFullAt: Date | null;
  lastFullSeen: number | null;
}

export interface ChainFreshness extends ChainFreshnessRow {
  /** Що не так, простими словами; порожньо — мережа в порядку */
  problems: string[];
}

export function assessChain(row: ChainFreshnessRow, now: Date): ChainFreshness {
  const problems: string[] = [];
  if (row.lastRunStatus === 'FAILED') {
    problems.push(`Останній обхід упав: ${row.lastRunError ?? 'без причини'}`);
  }
  if (!row.lastFullAt) {
    problems.push('Повного обходу ще не було');
  } else if (
    now.getTime() - row.lastFullAt.getTime() >
    FRESHNESS_LIMITS.crawlDays * DAY
  ) {
    const days = Math.floor((now.getTime() - row.lastFullAt.getTime()) / DAY);
    problems.push(`Повний обхід ${days} дн. тому`);
  }
  if (
    row.lastFullSeen !== null &&
    row.lastFullSeen < row.active * FRESHNESS_LIMITS.delistShare
  ) {
    problems.push(
      `Обхід бачить ${row.lastFullSeen} із ${row.active} активних карток: зниклі знімаються лише за давністю`,
    );
  }
  if (row.stale > 0) {
    problems.push(
      `${row.stale} карток старші за ${FRESHNESS_LIMITS.staleDays} днів: не беруть участі в «найдешевше» і сповіщеннях`,
    );
  }
  return { ...row, problems };
}

/** Правила розкладу обходів (чисті функції): спільні для воркера (ScrapeScheduler) і API (ScheduleService) */

const HOUR = 60 * 60 * 1000;

/**
 * Запуск, що "висить" довше, вважаємо втраченим (воркер падав посеред обходу).
 * Повний обхід усіх мереж одним воркером триває години, тож поріг великий.
 */
const MIN_STALE_RUN_MS = 48 * HOUR;

/** Межі інтервалу, який можна задати в адмінці: від години до двох тижнів */
export const MIN_INTERVAL_HOURS = 1;
export const MAX_INTERVAL_HOURS = 336;

/** Налаштування планувальника (Redis `scraper:schedule`, змінює адмінка) */
export interface ScheduleSettings {
  /** Чи ставить воркер обходи за розкладом */
  enabled: boolean;
  /** Повний обхід кожної мережі раз на стільки годин */
  intervalHours: number;
  /**
   * Ручний запуск ("Запустити зараз") зараховується як плановий: таймер мережі
   * рахується від нього. false — плановий обхід однаково відбудеться у свій час.
   */
  manualResetsTimer: boolean;
}

/** Без збережених налаштувань — з оточення (SCRAPE_SCHEDULE, SCRAPE_INTERVAL_HOURS) */
export function defaultSettings(
  env: Record<string, string | undefined>,
): ScheduleSettings {
  const hours = Number(env.SCRAPE_INTERVAL_HOURS);
  return {
    enabled: env.SCRAPE_SCHEDULE === 'true',
    intervalHours: Number.isFinite(hours) && hours > 0 ? hours : 24,
    manualResetsTimer: true,
  };
}

/** Збережене значення з Redis поверх типових; биті поля ігноруємо */
export function parseSettings(
  raw: string | null,
  defaults: ScheduleSettings,
): ScheduleSettings {
  let saved: Partial<Record<keyof ScheduleSettings, unknown>> = {};
  try {
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (value && typeof value === 'object') saved = value;
  } catch {
    // битий JSON — типові налаштування
  }
  const hours = saved.intervalHours;
  return {
    enabled:
      typeof saved.enabled === 'boolean' ? saved.enabled : defaults.enabled,
    intervalHours:
      typeof hours === 'number' &&
      hours >= MIN_INTERVAL_HOURS &&
      hours <= MAX_INTERVAL_HOURS
        ? hours
        : defaults.intervalHours,
    manualResetsTimer:
      typeof saved.manualResetsTimer === 'boolean'
        ? saved.manualResetsTimer
        : defaults.manualResetsTimer,
  };
}

export interface ChainSchedule {
  slug: string;
  /** Останній запуск будь-якого типу: чи мережа зараз у черзі або обходиться */
  lastRun: { startedAt: Date; status: string } | null;
  /**
   * Запуск, від якого рахується наступний плановий обхід. Не задано — lastRun;
   * коли ручні запуски не скидають таймер — останній запуск планувальника (cron).
   */
  basis?: { startedAt: Date } | null;
  /** Щоденний обхід після цієї години UTC (мережі лише з акціями); null — лише інтервал */
  scrapeHourUtc?: number | null;
}

/** Остання щоденна межа `hour`:00 UTC, що вже настала */
export function lastDailyBoundary(now: Date, hour: number): Date {
  const boundary = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour),
  );
  if (boundary > now) boundary.setUTCDate(boundary.getUTCDate() - 1);
  return boundary;
}

export function isActive(run: { status: string } | null): boolean {
  return run?.status === 'QUEUED' || run?.status === 'RUNNING';
}

/**
 * Коли мережі пора на плановий обхід: через інтервал після базового запуску або на
 * першій щоденній межі після нього (scrapeHourUtc). Без запусків — одразу (епоха).
 */
export function nextDueAt(chain: ChainSchedule, intervalMs: number): Date {
  const basis = chain.basis === undefined ? chain.lastRun : chain.basis;
  if (!basis) return new Date(0);
  let next = basis.startedAt.getTime() + intervalMs;
  if (chain.scrapeHourUtc != null) {
    const daily = lastDailyBoundary(basis.startedAt, chain.scrapeHourUtc);
    daily.setUTCDate(daily.getUTCDate() + 1);
    next = Math.min(next, daily.getTime());
  }
  return new Date(next);
}

/**
 * Мережі, яким пора на повний обхід: настав nextDueAt і жоден запуск цієї мережі
 * зараз не чекає в черзі й не виконується (завислий понад поріг — повторюємо).
 */
export function dueChains(
  chains: ChainSchedule[],
  now: Date,
  intervalMs: number,
): string[] {
  return chains
    .filter((chain) => {
      const { lastRun } = chain;
      if (lastRun && isActive(lastRun)) {
        const age = now.getTime() - lastRun.startedAt.getTime();
        return age > Math.max(2 * intervalMs, MIN_STALE_RUN_MS);
      }
      return nextDueAt(chain, intervalMs) <= now;
    })
    .map((chain) => chain.slug);
}

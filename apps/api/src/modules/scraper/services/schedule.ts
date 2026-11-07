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

/** Часові пояси розкладу в адмінці, годин від UTC */
export const UTC_OFFSETS = [0, 2];
/** "HH:MM" */
export const START_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  /** Обходи рівно о цій годині "HH:MM" з кроком intervalHours; null — інтервал від останнього запуску */
  startTime: string | null;
  /** Пояс startTime, годин від UTC */
  utcOffset: number;
  /** Коли змінили час чи період (ISO): пропущене до цього не наздоганяємо */
  startTimeSetAt: string | null;
}

export type ScheduleTime = Pick<
  ScheduleSettings,
  'startTime' | 'utcOffset' | 'startTimeSetAt'
>;

/** Без збережених налаштувань — з оточення (SCRAPE_SCHEDULE, SCRAPE_INTERVAL_HOURS) */
export function defaultSettings(
  env: Record<string, string | undefined>,
): ScheduleSettings {
  const hours = Number(env.SCRAPE_INTERVAL_HOURS);
  return {
    enabled: env.SCRAPE_SCHEDULE === 'true',
    intervalHours: Number.isFinite(hours) && hours > 0 ? hours : 24,
    manualResetsTimer: true,
    startTime: null,
    utcOffset: 2,
    startTimeSetAt: null,
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
    startTime:
      typeof saved.startTime === 'string' && START_TIME.test(saved.startTime)
        ? saved.startTime
        : saved.startTime === null
          ? null
          : defaults.startTime,
    utcOffset:
      typeof saved.utcOffset === 'number' &&
      UTC_OFFSETS.includes(saved.utcOffset)
        ? saved.utcOffset
        : defaults.utcOffset,
    startTimeSetAt:
      typeof saved.startTimeSetAt === 'string'
        ? saved.startTimeSetAt
        : defaults.startTimeSetAt,
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
  /** Дні тижня UTC для scrapeHourUtc; null чи порожньо — щодня */
  scrapeWeekdays?: number[] | null;
}

/**
 * Дні тижня UTC (0 — неділя … 6 — субота), коли мережа лише з акціями отримує нові акції.
 * Мережа з scrapeHourUtc, якої тут немає, обходиться щодня. Щоб обмежити іншу мережу,
 * достатньо додати рядок.
 */
export const OFFER_WEEKDAYS: Record<string, number[]> = {
  'kaufland-de': [1, 4],
};

/**
 * Перша межа `hour`:00 UTC строго після `after` у дозволений день тижня (порожньо — щодня).
 * Дні мають бути 0–6, інакше виняток: якщо їх колись братимемо з БД чи адмінки, валідуємо там.
 */
export function nextBoundaryAfter(
  after: Date,
  hour: number,
  weekdays?: number[] | null,
): Date {
  for (let day = 0; day <= 7; day++) {
    const boundary = new Date(
      Date.UTC(
        after.getUTCFullYear(),
        after.getUTCMonth(),
        after.getUTCDate() + day,
        hour,
      ),
    );
    if (
      boundary > after &&
      (!weekdays?.length || weekdays.includes(boundary.getUTCDay()))
    )
      return boundary;
  }
  throw new Error(`Немає дозволеного дня тижня: ${weekdays?.join(',')}`);
}

export function isActive(run: { status: string } | null): boolean {
  return run?.status === 'QUEUED' || run?.status === 'RUNNING';
}

/**
 * Перший слот сітки "час + k × інтервал" не раніше за `after`. Сітка від фіксованої дати,
 * тому за періоду, кратного добі чи її дільника, обхід щоразу припадає на обраний час.
 */
export function nextSlot(
  startTime: string,
  utcOffset: number,
  intervalMs: number,
  after: number,
): number {
  const [hours, minutes] = startTime.split(':').map(Number);
  const anchor = Date.UTC(2000, 0, 1, hours - utcOffset, minutes);
  return anchor + Math.ceil((after - anchor) / intervalMs) * intervalMs;
}

/**
 * Коли мережі пора на плановий обхід: через інтервал після базового запуску або на
 * першій щоденній межі після нього (scrapeHourUtc). Якщо задано й дні тижня — лише на
 * межі в ці дні, інтервал не діє, окрім невдалого запуску: його повторюємо через інтервал.
 * Для такої мережі заданий в адмінці час (startTime) теж не діє. Без запусків — одразу (епоха).
 * Заданий час: найближчий слот після базового запуску й після зміни розкладу. Якщо
 * ручний запуск замінює плановий (basis не задано), слот шукаємо щонайменше за пів
 * інтервалу від нього, інакше обхід повторився б одразу після ручного.
 */
export function nextDueAt(
  chain: ChainSchedule,
  intervalMs: number,
  time?: ScheduleTime,
): Date {
  const basis = chain.basis === undefined ? chain.lastRun : chain.basis;
  let next: number;
  if (chain.scrapeHourUtc != null && chain.scrapeWeekdays?.length) {
    if (!basis) return new Date(0);
    next = nextBoundaryAfter(
      basis.startedAt,
      chain.scrapeHourUtc,
      chain.scrapeWeekdays,
    ).getTime();
    if (chain.lastRun?.status === 'FAILED')
      next = Math.min(next, chain.lastRun.startedAt.getTime() + intervalMs);
    return new Date(next);
  }
  if (time?.startTime) {
    const gap = chain.basis === undefined ? intervalMs / 2 : 1;
    const after = Math.max(
      basis ? basis.startedAt.getTime() + gap : 0,
      time.startTimeSetAt ? Date.parse(time.startTimeSetAt) : 0,
    );
    next = nextSlot(time.startTime, time.utcOffset, intervalMs, after);
  } else if (!basis) return new Date(0);
  else next = basis.startedAt.getTime() + intervalMs;
  if (basis && chain.scrapeHourUtc != null) {
    const daily = nextBoundaryAfter(basis.startedAt, chain.scrapeHourUtc);
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
  time?: ScheduleTime,
): string[] {
  return chains
    .filter((chain) => {
      const { lastRun } = chain;
      if (lastRun && isActive(lastRun)) {
        const age = now.getTime() - lastRun.startedAt.getTime();
        return age > Math.max(2 * intervalMs, MIN_STALE_RUN_MS);
      }
      return nextDueAt(chain, intervalMs, time) <= now;
    })
    .map((chain) => chain.slug);
}

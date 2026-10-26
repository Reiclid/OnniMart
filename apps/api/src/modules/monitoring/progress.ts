/**
 * Прогрес обходу без БД: скільки товарів мережі вже записано відносно попереднього вдалого
 * обходу з тим самим обмеженням сторінок, і скільки приблизно лишилось чекати.
 */

export interface RunCounters {
  status: string;
  startedAt: Date;
  itemsSeen: number;
}

export interface PreviousRun {
  itemsSeen: number;
  startedAt: Date;
  finishedAt: Date;
}

export interface RunProgress {
  /** Очікувана кількість товарів (з попереднього обходу) */
  expectedItems: number | null;
  /** 0..0,99: «100 %» показує лише сам кінець обходу */
  fraction: number | null;
  /** Приблизно секунд до кінця */
  etaSeconds: number | null;
}

const NONE: RunProgress = {
  expectedItems: null,
  fraction: null,
  etaSeconds: null,
};

/** Доки зроблено менше цієї частки, швидкість ще ненадійна — ETA з тривалості попереднього обходу */
const RELIABLE_FRACTION = 0.1;

export function runProgress(
  run: RunCounters,
  previous: PreviousRun | null,
  now: Date,
): RunProgress {
  if (run.status !== 'RUNNING' || !previous || previous.itemsSeen <= 0)
    return NONE;
  const fraction = Math.min(run.itemsSeen / previous.itemsSeen, 0.99);
  const elapsed = Math.max(now.getTime() - run.startedAt.getTime(), 0) / 1000;
  const previousDuration =
    (previous.finishedAt.getTime() - previous.startedAt.getTime()) / 1000;
  const eta =
    fraction >= RELIABLE_FRACTION
      ? (elapsed * (1 - fraction)) / fraction
      : previousDuration - elapsed;
  return {
    expectedItems: previous.itemsSeen,
    fraction,
    etaSeconds: Math.max(Math.round(eta), 0),
  };
}

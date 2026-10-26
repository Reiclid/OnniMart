import { runProgress } from './progress';

const NOW = new Date('2026-10-26T20:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const previous = {
  itemsSeen: 1000,
  startedAt: minutesAgo(120),
  finishedAt: minutesAgo(100),
};

describe('runProgress', () => {
  it('частка від попереднього обходу і ETA за поточною швидкістю', () => {
    const p = runProgress(
      { status: 'RUNNING', startedAt: minutesAgo(5), itemsSeen: 250 },
      previous,
      NOW,
    );
    expect(p).toEqual({ expectedItems: 1000, fraction: 0.25, etaSeconds: 900 });
  });

  it('на самому початку — ETA з тривалості попереднього обходу', () => {
    const p = runProgress(
      { status: 'RUNNING', startedAt: minutesAgo(2), itemsSeen: 10 },
      previous,
      NOW,
    );
    expect(p.etaSeconds).toBe(18 * 60);
  });

  it('товарів більше, ніж минулого разу — не 100 %, а 99 %', () => {
    const p = runProgress(
      { status: 'RUNNING', startedAt: minutesAgo(20), itemsSeen: 1200 },
      previous,
      NOW,
    );
    expect(p.fraction).toBe(0.99);
  });

  it('перший обхід мережі або вже не триває — оцінки немає', () => {
    const run = { status: 'RUNNING', startedAt: minutesAgo(1), itemsSeen: 5 };
    expect(runProgress(run, null, NOW).fraction).toBeNull();
    expect(
      runProgress({ ...run, status: 'SUCCESS' }, previous, NOW).etaSeconds,
    ).toBeNull();
  });
});

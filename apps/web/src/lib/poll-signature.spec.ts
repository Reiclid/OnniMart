import { matchingSignature, overviewSignature } from './poll-signature';

const run = { id: 'r1', status: 'RUNNING' as const, pagesFetched: 3, itemsSeen: 120, itemsChanged: 10, itemsFailed: 0 };
const health = { worker: true, queues: { tasks: 2, results: 5, dead: 0 } };

describe('overviewSignature', () => {
  it('однаковий, поки нічого не змінилось', () => {
    expect(overviewSignature([run], health)).toBe(overviewSignature([{ ...run }], { ...health }));
  });

  it('змінюється від статусу, прогресу запуску, нового запуску й черги', () => {
    const base = overviewSignature([run], health);
    expect(overviewSignature([{ ...run, status: 'SUCCESS' }], health)).not.toBe(base);
    expect(overviewSignature([{ ...run, itemsSeen: 121 }], health)).not.toBe(base);
    expect(overviewSignature([{ ...run, id: 'r2' }, run], health)).not.toBe(base);
    expect(overviewSignature([run], { ...health, queues: { tasks: 2, results: 4, dead: 0 } })).not.toBe(base);
    expect(overviewSignature([run], { ...health, worker: false })).not.toBe(base);
  });

  it('витримує недоступний /health', () => {
    expect(overviewSignature([run], null)).toContain('-');
  });
});

describe('matchingSignature', () => {
  it('змінюється, коли запуск починається й завершується', () => {
    const idle = matchingSignature({ running: false, lastReport: null });
    const running = matchingSignature({ running: true, lastReport: null });
    const done = matchingSignature({
      running: false,
      lastReport: { finishedAt: '2026-11-07T10:00:00Z' } as never,
    });
    expect(new Set([idle, running, done]).size).toBe(3);
  });
});

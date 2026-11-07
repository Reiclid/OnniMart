import {
  assessChain,
  ChainFreshnessRow,
  freshOrAll,
  isStale,
} from './freshness';

const NOW = new Date('2026-11-07T00:00:00Z');
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const row = (over: Partial<ChainFreshnessRow> = {}): ChainFreshnessRow => ({
  chain: 'kaufland-de',
  name: 'Kaufland',
  country: 'DE',
  active: 100,
  older2d: 0,
  older7d: 0,
  stale: 0,
  lastRunAt: daysAgo(1),
  lastRunStatus: 'SUCCESS',
  lastRunError: null,
  lastFullAt: daysAgo(1),
  lastFullSeen: 100,
  ...over,
});

describe('isStale', () => {
  it('межа — 14 днів, картка без дати свіжа', () => {
    expect(isStale(daysAgo(14), NOW)).toBe(false);
    expect(isStale(daysAgo(15), NOW)).toBe(true);
    expect(isStale(undefined, NOW)).toBe(false);
  });
});

describe('freshOrAll', () => {
  const fresh = { lastSeenAt: daysAgo(1) };
  const old = { lastSeenAt: daysAgo(30) };

  it('стара пропозиція не бере участі, поки є свіжа', () => {
    expect(freshOrAll([fresh, old], NOW)).toEqual([fresh]);
  });

  it('усі старі (перерва в обходах) — ціна лишається', () => {
    expect(freshOrAll([old], NOW)).toEqual([old]);
  });
});

describe('assessChain', () => {
  it('усе гаразд — без зауважень', () => {
    expect(assessChain(row(), NOW).problems).toEqual([]);
  });

  it('упалий обхід і причина (ALDI Süd, 403)', () => {
    const { problems } = assessChain(
      row({ lastRunStatus: 'FAILED', lastRunError: 'сайт заблокував запит' }),
      NOW,
    );
    expect(problems).toEqual(['Останній обхід упав: сайт заблокував запит']);
  });

  it('повний обхід застарів або його не було', () => {
    expect(assessChain(row({ lastFullAt: daysAgo(10) }), NOW).problems).toEqual(
      ['Повний обхід 10 дн. тому'],
    );
    expect(
      assessChain(row({ lastFullAt: null, lastFullSeen: null }), NOW).problems,
    ).toEqual(['Повного обходу ще не було']);
  });

  it('обхід бачить менше половини карток (Kaufland: 632 із 2073)', () => {
    const { problems } = assessChain(
      row({ active: 2073, lastFullSeen: 632 }),
      NOW,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('632 із 2073');
  });

  it('старі картки називає кількістю', () => {
    expect(assessChain(row({ stale: 7 }), NOW).problems[0]).toContain(
      '7 карток',
    );
  });
});

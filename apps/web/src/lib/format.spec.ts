import { formatCountdown, formatEta, relativeTime, targetProgress } from './format';

describe('formatEta', () => {
  it('хвилини й години, округлено до хвилини', () => {
    expect(formatEta(20)).toBe('< 1 хв');
    expect(formatEta(12 * 60 + 10)).toBe('~12 хв');
    expect(formatEta(80 * 60)).toBe('~1 год 20 хв');
    expect(formatEta(2 * 3600)).toBe('~2 год');
  });
});

describe('formatCountdown', () => {
  it('години:хвилини:секунди, дні окремо, минуле — нулі', () => {
    expect(formatCountdown((4 * 3600 + 5 * 60 + 9) * 1000 + 999)).toBe('04:05:09');
    expect(formatCountdown((2 * 86_400 + 3600) * 1000)).toBe('2 д 01:00:00');
    expect(formatCountdown(-5000)).toBe('00:00:00');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  it('найбільша одиниця, що набралась', () => {
    expect(relativeTime('2026-11-01T11:48:00Z', now)).toEqual([-12, 'minute']);
    expect(relativeTime('2026-11-01T09:50:00Z', now)).toEqual([-2, 'hour']);
    expect(relativeTime('2026-10-31T10:00:00Z', now)).toEqual([-1, 'day']);
    expect(relativeTime('2026-11-01T11:59:40Z', now)).toEqual([0, 'minute']);
  });
});

describe('targetProgress', () => {
  it('частка до цілі й залишок; ціль досягнута — повна смужка', () => {
    expect(targetProgress(28, 31.49)).toEqual({ progress: 28 / 31.49, left: 3.49 });
    expect(targetProgress(30, 29)).toEqual({ progress: 1, left: 0 });
  });
});

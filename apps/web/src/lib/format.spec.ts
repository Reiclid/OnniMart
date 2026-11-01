import { formatCountdown, formatEta } from './format';

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

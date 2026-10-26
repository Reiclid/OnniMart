import { formatEta } from './format';

describe('formatEta', () => {
  it('хвилини й години, округлено до хвилини', () => {
    expect(formatEta(20)).toBe('< 1 хв');
    expect(formatEta(12 * 60 + 10)).toBe('~12 хв');
    expect(formatEta(80 * 60)).toBe('~1 год 20 хв');
    expect(formatEta(2 * 3600)).toBe('~2 год');
  });
});

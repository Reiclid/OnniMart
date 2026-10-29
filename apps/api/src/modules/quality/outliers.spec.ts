import { findOutliers, median, spread, zScore } from './outliers';

describe('spread', () => {
  it('медіана й масштаб не зсуваються від одного викиду', () => {
    const prices = [10, 11, 12, 10, 11, 12, 10, 11, 12, 11];
    const clean = spread(prices);
    const dirty = spread([...prices.slice(1), 1100]);
    expect(dirty.median).toBe(clean.median);
    expect(dirty.scale).toBeCloseTo(clean.scale, 5);
  });

  it('MAD = 0 (більшість однакові) — масштаб із середнього відхилення', () => {
    const s = spread([5, 5, 5, 5, 5, 5, 7]);
    expect(s.median).toBe(5);
    expect(s.scale).toBeGreaterThan(0);
  });

  it('усі однакові — масштаб 0, інше значення нескінченно далеко', () => {
    const s = spread([3, 3, 3]);
    expect(zScore(3, s)).toBe(0);
    expect(zScore(4, s)).toBe(Infinity);
  });

  it('медіана парної кількості — середнє двох середніх', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('findOutliers', () => {
  const rows = (group: string, prices: number[]) =>
    prices.map((price, i) => ({ id: `${group}${i}`, group, price }));
  const milk = rows('milk', [30, 32, 31, 29, 33, 30, 31, 32, 30, 31]);

  it('ціна в копійках (×100) — викид на логарифмічній шкалі', () => {
    const items = [...milk, { id: 'kop', group: 'milk', price: 3100 }];
    const found = findOutliers(
      items,
      (r) => r.group,
      (r) => Math.log(r.price),
    );
    expect(found.map((o) => o.item.id)).toEqual(['kop']);
    expect(found[0].z).toBeGreaterThan(3.5);
  });

  it('малі групи й точки без групи або значення не оцінюються', () => {
    const items = [
      ...rows('tiny', [1, 1, 1, 1000]),
      { id: 'x', group: null, price: 1 },
      { id: 'y', group: 'milk', price: null },
    ];
    expect(
      findOutliers(
        items,
        (r) => r.group,
        (r) => (r.price === null ? null : Math.log(r.price)),
      ),
    ).toEqual([]);
  });
});

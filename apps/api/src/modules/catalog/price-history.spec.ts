import {
  priceStats,
  seriesPoints,
  windowOf,
  type ListingHistory,
} from './price-history';

const NOW = new Date('2026-10-26T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const listing = (
  chainName: string,
  prices: [number, number][],
  currency = 'UAH',
): ListingHistory => ({
  listingId: chainName,
  chainName,
  currency,
  snapshots: prices.map(([ago, price]) => ({ price, at: daysAgo(ago) })),
});

describe('seriesPoints', () => {
  it('ціна на початок вікна, зміни всередині й поточна «зараз»', () => {
    const points = seriesPoints(
      listing('silpo', [
        [100, 50],
        [10, 45],
      ]).snapshots,
      daysAgo(30),
      NOW,
    );
    expect(points).toEqual([
      { price: 50, at: daysAgo(30), observed: false },
      { price: 45, at: daysAgo(10), observed: true },
      { price: 45, at: NOW, observed: false },
    ]);
  });

  it('історія коротша за вікно — від першого знімка', () => {
    expect(
      seriesPoints(listing('silpo', [[5, 50]]).snapshots, daysAgo(30), NOW),
    ).toEqual([
      { price: 50, at: daysAgo(5), observed: true },
      { price: 50, at: NOW, observed: false },
    ]);
  });

  it('знімок пізніший за кінець не губиться', () => {
    expect(
      seriesPoints(
        listing('metro', [
          [20, 329],
          [1, 535.6],
        ]).snapshots,
        daysAgo(30),
        daysAgo(3),
        true,
      ).map((p) => p.price),
    ).toEqual([329, 535.6]);
  });

  it('кінець — останній огляд картки: справжня точка', () => {
    expect(
      seriesPoints(
        listing('silpo', [[5, 50]]).snapshots,
        daysAgo(30),
        daysAgo(1),
        true,
      ).at(-1),
    ).toEqual({ price: 50, at: daysAgo(1), observed: true });
  });
});

describe('priceStats', () => {
  it('поточна, 30-денний мінімум, середня й розкид між мережами', () => {
    const [stats] = priceStats(
      [
        listing('silpo', [
          [60, 40],
          [20, 50],
        ]),
        listing('novus', [[40, 60]]),
      ],
      NOW,
    );
    expect(stats).toMatchObject({
      currency: 'UAH',
      current: 50,
      // 40 діяла до 20 днів тому — це в межах 30 днів
      low30: 40,
      average: 55,
      spread: 0.2,
      // Дешевше (40) було 20 днів тому
      lowestForDays: 20,
      lowerSeen: true,
    });
  });

  it('дешевше не було ніколи — днів історії', () => {
    const [stats] = priceStats(
      [
        listing('silpo', [
          [90, 60],
          [3, 45],
        ]),
      ],
      NOW,
    );
    expect(stats).toMatchObject({ lowestForDays: 90, lowerSeen: false });
  });

  it('валюти окремо; картки без знімків пропускаються', () => {
    const stats = priceStats(
      [
        listing('silpo', [[1, 50]]),
        listing('lidl-de', [[1, 1.5]], 'EUR'),
        { ...listing('novus', []), snapshots: [] },
      ],
      NOW,
    );
    expect(stats.map((s) => [s.currency, s.current])).toEqual([
      ['UAH', 50],
      ['EUR', 1.5],
    ]);
  });
});

it('windowOf: лише 30, 90 або 365 днів', () => {
  expect([
    windowOf(90),
    windowOf(365),
    windowOf(7),
    windowOf(undefined),
  ]).toEqual([90, 365, 30, 30]);
});

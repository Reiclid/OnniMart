import { priceRanges } from './catalog.service';

const offer = (
  price: number,
  chain: string,
  regular: number | null = null,
) => ({
  currency: 'UAH',
  price,
  chain,
  regular,
});

describe('priceRanges', () => {
  it('звичайна ціна — лише найдешевшої пропозиції на акції', () => {
    expect(priceRanges([offer(60, 'A'), offer(40, 'B', 50)])).toEqual([
      { currency: 'UAH', min: 40, max: 60, minChain: 'B', minRegular: 50 },
    ]);
    expect(
      priceRanges([offer(40, 'A'), offer(60, 'B', 80)])[0].minRegular,
    ).toBe(null);
  });

  it('за однакової ціни перевага в акції', () => {
    expect(priceRanges([offer(40, 'A'), offer(40, 'B', 50)])[0]).toMatchObject({
      minChain: 'B',
      minRegular: 50,
    });
  });

  it('"акція" зі звичайною ціною не вище поточної — не знижка', () => {
    expect(priceRanges([offer(40, 'A', 40)])[0].minRegular).toBe(null);
  });
});

import {
  boxOf,
  histogram,
  isBadDiscount,
  isRatioOff,
  isTinyPack,
  logLogResiduals,
  theilSen,
  QualityRow,
  variantRatios,
} from './checks';

function row(over: Partial<QualityRow>): QualityRow {
  return {
    id: 'l1',
    chain: 'aldi-nord',
    country: 'DE',
    name: 'Landbrot',
    measure: 'MASS',
    qty: 1000,
    pack: 1,
    weighted: false,
    price: 1.59,
    regular: null,
    unit: 1.59,
    variantId: 'v1',
    productId: 'p1',
    category: 'bakery',
    ...over,
  };
}

describe('isTinyPack', () => {
  it('«1 kg» як 1 г — помилка; ваговий, штуки й пакетики чаю — ні', () => {
    expect(isTinyPack(row({ qty: 1 }))).toBe(true);
    expect(isTinyPack(row({ qty: 1000 }))).toBe(false);
    expect(isTinyPack(row({ qty: 1, weighted: true }))).toBe(false);
    expect(isTinyPack(row({ qty: 2, measure: 'COUNT' }))).toBe(false);
    // «Чай 2 г × 20» — 40 г, не крихітний, хоча один пакетик 2 г
    expect(isTinyPack(row({ qty: 40, pack: 20 }))).toBe(false);
  });
});

describe('isBadDiscount', () => {
  it('закреслена ≤ поточної або знижка > 70 %', () => {
    expect(isBadDiscount(row({ price: 2, regular: 1.6 }))).toBe(true);
    expect(isBadDiscount(row({ price: 2, regular: 2 }))).toBe(true);
    expect(isBadDiscount(row({ price: 1, regular: 4 }))).toBe(true);
    expect(isBadDiscount(row({ price: 1.5, regular: 2 }))).toBe(false);
    expect(isBadDiscount(row({ regular: null }))).toBe(false);
  });
});

describe('variantRatios', () => {
  it('ціна ÷ медіана інших мереж того самого фасування в країні', () => {
    const ratios = variantRatios([
      row({ id: 'a', price: 1 }),
      row({ id: 'b', price: 1 }),
      row({ id: 'c', price: 2 }),
      row({ id: 'ua', country: 'UA', price: 50 }),
    ]);
    expect(ratios.get('c')).toBe(2);
    expect(ratios.get('a')).toBeCloseTo(1 / 1.5);
    // Одна картка в країні — не з чим порівняти
    expect(ratios.has('ua')).toBe(false);
    expect(isRatioOff(2)).toBe(true);
    expect(isRatioOff(1.5)).toBe(false);
    expect(isRatioOff(0.5)).toBe(true);
  });
});

describe('logLogResiduals', () => {
  it('точка далеко від прямої групи має великий залишок', () => {
    // Ціна за кг падає з розміром: 100 г — 10 €/кг, 1000 г — 5 €/кг
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({ id: `r${i}`, qty: 100 * (i + 1), unit: 10 / Math.sqrt(i + 1) }),
    );
    rows.push(row({ id: 'bad', qty: 500, unit: 1000 }));
    const { residuals, fits } = logLogResiduals(rows);
    expect(Math.abs(residuals.get('r3')!)).toBeLessThan(0.05);
    expect(residuals.get('bad')!).toBeGreaterThan(4);
    expect(fits.get('bakery|DE|MASS')!.slope).toBeCloseTo(-0.5, 2);
  });

  it('більшість точок одного розміру не ламає нахил (пляшки 0,7 л)', () => {
    const xs = [
      ...Array.from({ length: 30 }, () => Math.log(700)),
      Math.log(350),
      Math.log(1000),
    ];
    // Ціни 0,7 л різні: 10…40 €/л, а 0,35 і 1 л — на прямій з нахилом −0,3
    const ys = [
      ...Array.from({ length: 30 }, (_, i) => Math.log(10 + i)),
      Math.log(20 * Math.pow(0.5, -0.3)),
      Math.log(20 * Math.pow(1000 / 700, -0.3)),
    ];
    const { slope } = theilSen(xs, ys);
    expect(Math.abs(slope)).toBeLessThan(2);
  });

  it('малі групи не оцінюються', () => {
    expect(logLogResiduals([row({})]).residuals.size).toBe(0);
  });
});

describe('boxOf / histogram', () => {
  it('квартилі з інтерполяцією', () => {
    expect(boxOf([1, 2, 3, 4, 5])).toEqual({
      n: 5,
      p5: 1.2,
      q1: 2,
      median: 3,
      q3: 4,
      p95: 4.8,
    });
    expect(boxOf([])).toBeNull();
  });

  it('крайні кошики збирають усе за межами', () => {
    expect(
      histogram([-5, 0.5, 1.5, 99], [0, 1, 2]).map((b) => b.count),
    ).toEqual([2, 2]);
  });
});

import type { QualityRow } from './checks';
import { buildReport, groupLabel } from './report';

function row(id: string, over: Partial<QualityRow> = {}): QualityRow {
  return {
    id,
    chain: 'aldi-nord',
    country: 'DE',
    name: `Kaffee ${id}`,
    measure: 'MASS',
    qty: 500,
    pack: 1,
    weighted: false,
    price: 5,
    regular: null,
    unit: 10,
    variantId: null,
    productId: null,
    category: 'coffee-tea',
    ...over,
  };
}

const names = new Map([['coffee-tea', 'Кава і чай']]);

/** 12 нормальних кав і одна з «1 kg» як 1 г (ціна за кг ×1000) */
const ROWS = [
  ...Array.from({ length: 12 }, (_, i) =>
    row(`k${i}`, { unit: 10 + i, chain: i % 2 ? 'penny-de' : 'aldi-nord' }),
  ),
  row('bad', { qty: 1, unit: 8990 }),
];

describe('buildReport', () => {
  it('викид ціни за кг і крихітне фасування — з посиланням на картку', () => {
    const report = buildReport(ROWS, { categoryNames: names });
    expect(report.unitPrice.flagged.map((f) => f.listingId)).toEqual(['bad']);
    expect(report.unitPrice.groups[0]).toMatchObject({
      key: 'coffee-tea|DE|MASS',
      label: 'Кава і чай · DE · за кг',
      n: 13,
    });
    expect(report.unitPrice.groups[0].flagged).toHaveLength(1);
    expect(report.packSize.flagged).toMatchObject([
      { listingId: 'bad', value: 1, group: 'г' },
    ]);
    expect(report.completeness.map((c) => c.chain)).toEqual([
      'aldi-nord',
      'penny-de',
    ]);
  });

  it('фільтр мережі ховає чужі позначки, але групу рахує по всій країні', () => {
    const report = buildReport(ROWS, {
      chain: 'penny-de',
      categoryNames: names,
    });
    expect(report.unitPrice.total).toBe(0);
    expect(report.unitPrice.groups[0].n).toBe(13);
    expect(report.analysed).toBe(6);
  });

  it('ціна в іншій мережі вдвічі вища — позначка відношення', () => {
    const report = buildReport(
      [
        row('a', { variantId: 'v', price: 1 }),
        row('b', { variantId: 'v', price: 1, chain: 'penny-de' }),
        row('c', { variantId: 'v', price: 2, chain: 'lidl-de' }),
      ],
      { categoryNames: names },
    );
    expect(report.variantRatio.flagged).toMatchObject([
      { listingId: 'c', value: 2, reference: 1 },
    ]);
  });

  it('підпис групи без назви категорії — slug', () => {
    expect(groupLabel('x|UA|VOLUME', new Map())).toBe('x · UA · за л');
  });
});

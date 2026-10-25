import type { ListingInput } from './catalog-index';
import { extractFeatures } from './features';
import { parseQuantity } from './normalization/quantity';
import { OffIndex, type OffProduct } from './off-match';
import { buildIdf } from './similarity';

const idf = buildIdf([]);

function listing(
  name: string,
  brand: string | null,
  country = 'DE',
): ListingInput {
  const q = parseQuantity(name);
  return {
    id: name,
    chainId: 'aldi-sued',
    country,
    barcodes: [],
    quantity: {
      measure: q?.measure ?? null,
      netQuantity: q?.netQuantity ?? null,
      packCount: q?.packCount ?? 1,
      isWeighted: q?.isWeighted ?? false,
    },
    features: extractFeatures(name, brand),
  };
}

function off(
  gtin: string,
  name: string,
  brands: string[],
  quantity: string,
  country = 'DE',
): OffProduct {
  return { gtin, country, name, brands, quantity: parseQuantity(quantity) };
}

describe('OffIndex', () => {
  it('однозначний збіг — GTIN, навіть коли перший бренд OFF помилковий', () => {
    const index = new OffIndex();
    index.add(
      off(
        '00000042141204',
        'Mineralwasser Medium',
        ['Milbona', 'Quellbrunn'],
        '1,5 l',
      ),
    );
    index.add(off('04005906003557', 'Apfelschorle', ['Lichtenauer'], '1,5 l'));
    expect(
      index.decide(
        listing('Quellbrunn Mineralwasser Medium 1,5 l', 'Quellbrunn'),
        idf,
      ),
    ).toEqual({ kind: 'match', gtin: '00000042141204', score: 1 });
  });

  it('інше фасування, інша країна, невідоме фасування чи бренд — ні', () => {
    const index = new OffIndex();
    index.add(
      off('00000042141204', 'Mineralwasser Medium', ['Quellbrunn'], '1,5 l'),
    );
    const decide = (name: string, country?: string) =>
      index.decide(listing(name, 'Quellbrunn', country), idf).kind;
    expect(decide('Quellbrunn Mineralwasser Medium 0,5 l')).toBe('none');
    expect(decide('Quellbrunn Mineralwasser Medium 1,5 l', 'AT')).toBe('none');
    expect(decide('Quellbrunn Mineralwasser Medium')).toBe('none');
    expect(
      index.decide(listing('Mineralwasser Medium 1,5 l', null), idf).kind,
    ).toBe('none');
    expect(index.add(off('2', 'Grüne Oliven', [], '200 g'))).toBe(false);
    expect(index.add(off('1', 'Mineralwasser', ['Quellbrunn'], ''))).toBe(
      false,
    );
  });

  it('два однакові товари OFF (стара й нова упаковка) — лише на перевірку', () => {
    const index = new OffIndex();
    index.add(
      off('00000042141204', 'Mineralwasser Medium', ['Quellbrunn'], '1,5 l'),
    );
    index.add(
      off('00000042299998', 'Mineralwasser Medium', ['Quellbrunn'], '1,5 l'),
    );
    const decision = index.decide(
      listing('Quellbrunn Mineralwasser Medium 1,5 l', 'Quellbrunn'),
      idf,
    );
    expect(decision.kind).toBe('review');
  });

  it('різні ознаки різновиду (Medium і Still) не зіставляються', () => {
    const index = new OffIndex();
    index.add(
      off('00000042141204', 'Mineralwasser Medium', ['Quellbrunn'], '1,5 l'),
    );
    expect(
      index.decide(
        listing('Quellbrunn Mineralwasser Still 1,5 l', 'Quellbrunn'),
        idf,
      ).kind,
    ).not.toBe('match');
  });
});

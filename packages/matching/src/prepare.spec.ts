import { brandSimilarity } from './similarity';
import {
  canonicalBrand,
  listingInput,
  ListingRow,
  prepareListings,
  productFeatures,
} from './prepare';
import { extractFeatures } from './features';

function row(id: string, rawName: string, rawBrand: string | null): ListingRow {
  return {
    id,
    chainId: id,
    country: 'DE',
    rawName,
    rawBrand,
    barcodes: [],
    measure: 'VOLUME',
    netQuantity: 750,
    packCount: 1,
    isWeighted: false,
  };
}

describe('злиття брендів (brand_aliases)', () => {
  const aliases = new Map([['premiia', 'premia']]);

  it('дублікат отримує ключ основного бренду, і пара більше не конфліктує', () => {
    // Та сама марка латиницею й кирилицею: ключі premia / premiia
    const a = row('a', 'Сік PREMIA апельсиновий', 'PREMIA');
    const b = row('b', 'Сік Премія апельсиновий', 'Премія');
    const before = [a, b].map((r) => listingInput(r, new Map()).features.brand);
    expect(brandSimilarity(before[0], before[1])).toBe(0);
    const { inputs } = prepareListings([a, b], aliases);
    expect(inputs.get('b')!.features.brand).toBe('premia');
    expect(
      brandSimilarity(
        inputs.get('a')!.features.brand,
        inputs.get('b')!.features.brand,
      ),
    ).toBe(1);
    // Слова бренду прибрано за назвою з картки, як і раніше
    expect(inputs.get('b')!.features.tokens.map((t) => t.norm)).toEqual([
      'сік',
      'апельсиновии',
    ]);
  });

  it('без аліасу — ознаки без змін', () => {
    const f = extractFeatures('Cola', 'Pepsi');
    expect(canonicalBrand(f, aliases)).toBe(f);
    expect(canonicalBrand(f)).toBe(f);
  });
});

describe('productFeatures', () => {
  it('ключ — збережений slug бренду, а слова прибираються за назвою', () => {
    // Бренд перейменовано "PREMIA" → "Премія": ключ лишається premia
    const f = productFeatures('Сік Премія апельсиновий', {
      name: 'Премія',
      slug: 'premia',
    });
    expect(f.brand).toBe('premia');
    expect(f.tokens.map((t) => t.norm)).toEqual(['сік', 'апельсиновии']);
  });

  it('товар без бренду', () => {
    expect(productFeatures('Хліб житній', null).brand).toBeNull();
  });
});

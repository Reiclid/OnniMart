import {
  CatalogIndex,
  ListingInput,
  matchKeys,
  quantityKey,
  QuantityInfo,
} from './catalog-index';
import { extractFeatures } from './features';

const LITRE_1_5: QuantityInfo = {
  measure: 'VOLUME',
  netQuantity: 1500,
  packCount: 1,
  isWeighted: false,
};

let next = 0;
function listing(
  name: string,
  brand: string | null,
  overrides: Partial<ListingInput> = {},
): ListingInput {
  return {
    id: `l${next++}`,
    chainId: 'novus',
    country: 'UA',
    barcodes: [],
    quantity: LITRE_1_5,
    features: extractFeatures(name, brand),
    ...overrides,
  };
}

/** Каталог з одним товаром "Моршинська негазована 1,5 л" (картка Ашану) */
function catalogWithWater() {
  const index = new CatalogIndex();
  const seed = listing(
    'Вода мінеральна Моршинська негазована 1,5л',
    'Моршинська',
    {
      chainId: 'auchan',
      barcodes: ['04820017000024'],
    },
  );
  index.addProduct('p1', seed.features, 'UA');
  index.addVariant('v1', 'p1', quantityKey(seed.quantity));
  index.addBarcode('v1', '04820017000024');
  index.addName('v1', seed.features, 'UA', 'auchan');
  return index;
}

describe('CatalogIndex.decide', () => {
  it('відомий штрихкод — те саме фасування', () => {
    const decision = catalogWithWater().decide(
      listing('Будь-яка назва', null, { barcodes: ['04820017000024'] }),
    );
    expect(decision).toEqual({
      kind: 'barcode',
      variantId: 'v1',
      rules: ['barcode'],
    });
  });

  it('та сама назва в іншій мережі — автоматичне зіставлення', () => {
    const decision = catalogWithWater().decide(
      listing('Вода мінеральна «Моршинська» негазована', 'Моршинська', {
        chainId: 'silpo',
      }),
    );
    expect(decision).toMatchObject({
      kind: 'fuzzy',
      variantId: 'v1',
      score: 1,
    });
  });

  it('інша картка тієї самої мережі — інший товар', () => {
    const decision = catalogWithWater().decide(
      listing('Вода мінеральна Моршинська негазована 1,5л', 'Моршинська', {
        chainId: 'auchan',
      }),
    );
    expect(decision.kind).toBe('product');
  });

  it('той самий товар іншого фасування — нове фасування товару', () => {
    const decision = catalogWithWater().decide(
      listing('Вода мінеральна Моршинська негазована 0,5л', 'Моршинська', {
        quantity: { ...LITRE_1_5, netQuantity: 500 },
      }),
    );
    expect(decision).toMatchObject({ kind: 'variant', productId: 'p1' });
  });

  it('інший різновид — новий товар', () => {
    const decision = catalogWithWater().decide(
      listing('Вода мінеральна Моршинська слабогазована 1,5л', 'Моршинська'),
    );
    expect(decision.kind).toBe('product');
  });

  it('різні штрихкоди: автоматично лише за повного збігу назв', () => {
    const index = catalogWithWater();
    const same = index.decide(
      listing('Вода мінеральна Моршинська негазована 1,5л', 'Моршинська', {
        barcodes: ['04820017000999'],
      }),
    );
    expect(same).toMatchObject({ kind: 'fuzzy', variantId: 'v1' });

    const similar = index.decide(
      listing(
        'Вода мінеральна Моршинська негазована лікувально-столова',
        'Моршинська',
        {
          barcodes: ['04820017000999'],
        },
      ),
    );
    expect(similar.kind).toBe('review');
  });

  it('кілька майже однакових кандидатів — на модерацію', () => {
    const index = catalogWithWater();
    const twin = listing(
      'Вода мінеральна Моршинська негазована',
      'Моршинська',
      {
        chainId: 'eko',
      },
    );
    index.addProduct('p2', twin.features, 'UA');
    index.addVariant('v2', 'p2', quantityKey(twin.quantity));
    index.addName('v2', twin.features, 'UA', 'eko');

    const decision = index.decide(
      listing('Вода мінеральна Моршинська негазована 1,5л', 'Моршинська', {
        chainId: 'silpo',
      }),
    );
    expect(decision.kind).toBe('review');
  });

  it('відхилену модератором пару більше не пропонує', () => {
    const index = catalogWithWater();
    const card = listing(
      'Вода мінеральна Моршинська негазована',
      'Моршинська',
      {
        chainId: 'silpo',
      },
    );
    index.reject(card.id, 'v1');
    expect(index.decide(card).kind).not.toBe('fuzzy');
  });

  it('товар іншої країни — лише за повного збігу бренду, назви й фасування', () => {
    const index = new CatalogIndex();
    const ua = listing('Напій газований Coca-Cola 1,25л', 'Coca-Cola', {
      chainId: 'eko',
      quantity: { ...LITRE_1_5, netQuantity: 1250 },
    });
    index.addProduct('cola', ua.features, 'UA');
    index.addVariant('cola-1250', 'cola', quantityKey(ua.quantity));
    index.addName('cola-1250', ua.features, 'UA', 'eko');

    const de = (name: string, netQuantity = 1250) =>
      listing(name, 'COCA-COLA', {
        chainId: 'aldi-sued',
        country: 'DE',
        quantity: { ...LITRE_1_5, netQuantity },
      });
    expect(index.decide(de('Cola Original 1,25 l'))).toMatchObject({
      kind: 'fuzzy',
      variantId: 'cola-1250',
    });
    // Інше фасування того самого товару — нове фасування спільного товару
    expect(index.decide(de('Cola Original 1,5 l', 1500))).toMatchObject({
      kind: 'variant',
      productId: 'cola',
    });
    // Zero — інший товар; часткові збіги між мовами на модерацію не йдуть
    expect(index.decide(de('Cola Zero 1,25 l')).kind).toBe('product');
    expect(index.decide(de('Cola Mix 1,25 l')).kind).toBe('product');
  });
});

describe('CatalogIndex: правила (/admin/rules)', () => {
  it('вимкнений штрихкод — картку зіставляє лише назва', () => {
    const index = catalogWithWater();
    index.setRules({ barcode: false });
    const decision = index.decide(
      listing('Будь-яка назва', null, { barcodes: ['04820017000024'] }),
    );
    expect(decision.kind).toBe('product');
    expect(decision.rules).toBeUndefined();
  });

  it('ознаки різновиду: відкинутий кандидат записано, вимкнене правило його повертає', () => {
    const cola = listing('Напій Coca-Cola 1,5 л', 'Coca-Cola', {
      chainId: 'auchan',
    });
    const index = new CatalogIndex();
    index.addProduct('p1', cola.features, 'UA');
    index.addVariant('v1', 'p1', quantityKey(cola.quantity));
    index.addName('v1', cola.features, 'UA', 'auchan');
    const zero = listing('Напій Coca-Cola Zero без цукру 1,5 л', 'Coca-Cola');

    expect(index.decide(zero).rules).toEqual(['attributes']);
    expect(index.scoreCandidates(zero)).toEqual([]);
    index.setRules({ attributes: false });
    expect(index.scoreCandidates(zero).map((c) => c.variantId)).toEqual(['v1']);
  });

  it('нове фасування: увімкнене — фасування товару, вимкнене — новий товар', () => {
    const index = catalogWithWater();
    const small = listing(
      'Вода мінеральна Моршинська негазована 0,5л',
      'Моршинська',
      {
        chainId: 'silpo',
        quantity: { ...LITRE_1_5, netQuantity: 500 },
      },
    );
    expect(index.decide(small)).toMatchObject({
      kind: 'variant',
      productId: 'p1',
      rules: ['newVariant'],
    });
    index.setRules({ newVariant: false });
    expect(index.decide(small).kind).toBe('product');
  });
});

describe('matchKeys', () => {
  const key = quantityKey(LITRE_1_5);

  it('ключі пошуку — фасування зі словом і бренд', () => {
    const keys = matchKeys(
      key,
      extractFeatures(
        'Вода мінеральна Моршинська негазована 1,5л',
        'Моршинська',
      ),
    );
    expect(keys).toContain('VOLUME:1500:1|вода');
    expect(keys).toContain('VOLUME:1500:1|міне');
    expect(keys).toContain('b:morshynska');
  });

  it('ті самі ключі знаходять кандидата, що й блоки CatalogIndex', () => {
    const stored = listing(
      'Вода мінеральна Моршинська негазована 1,5л',
      'Моршинська',
    );
    const incoming = listing(
      'Мінеральна вода «Моршинська» негазована',
      'Моршинська',
      {
        chainId: 'silpo',
      },
    );
    const shared = matchKeys(key, stored.features).filter((k) =>
      matchKeys(key, incoming.features).includes(k),
    );
    expect(shared.length).toBeGreaterThan(0);

    const index = new CatalogIndex();
    index.addProduct('p1', stored.features, 'UA');
    index.addVariant('v1', 'p1', key);
    index.addName('v1', stored.features, 'UA', stored.chainId);
    expect(index.scoreCandidates(incoming).map((c) => c.variantId)).toEqual([
      'v1',
    ]);
  });
});

import {
  CatalogIndex,
  ListingInput,
  QuantityInfo,
  quantityKey,
  THRESHOLDS,
} from './catalog-index';
import { extractFeatures } from './features';
import { scorePair, variationMismatch } from './similarity';
import { learnVariations, VariationSample, variationGroup } from './variations';

const G150: QuantityInfo = {
  measure: 'MASS',
  netQuantity: 150,
  packCount: 1,
  isWeighted: false,
};
const flat = () => 1;

function sample(
  chainId: string,
  name: string,
  barcodes: string[] = [],
  group: string | null = 'almighurt|MASS:150:1',
): VariationSample {
  return { chainId, group, tokens: name.split(' '), barcodes };
}

/** Асортимент ALDI SÜD: одна лінійка в кількох смаках, у двох мережах */
const ALDI = [
  sample('aldi-sued', 'erdbeere'),
  sample('aldi-sued', 'stracciatella'),
  sample('aldi-sued', 'kirsche'),
  sample('aldi-nord', 'erdbeere'),
  sample('aldi-nord', 'stracciatella'),
];

describe('learnVariations', () => {
  it('слово, що єдине відрізняє дві картки однієї мережі, — варіація', () => {
    const variations = learnVariations(ALDI);
    expect(variations.get('stracciatella')).toBe(1);
    expect(variations.get('erdbeere')).toBe(1);
    // kirsche — лише в одній мережі, контраст 2 (з двома іншими смаками ALDI SÜD)
    expect(variations.get('kirsche')).toBe(1);
  });

  it('один контраст — замало', () => {
    const variations = learnVariations([
      sample('aldi-sued', 'erdbeere'),
      sample('aldi-sued', 'vanille'),
    ]);
    expect(variations.size).toBe(0);
  });

  it('картки різних мереж, різних груп або без фасування не дають контрасту', () => {
    const variations = learnVariations([
      sample('aldi-sued', 'erdbeere'),
      sample('aldi-nord', 'vanille'),
      sample('lidl', 'kirsche', [], 'a|MASS:150:1'),
      sample('lidl', 'zitrone', [], 'b|MASS:150:1'),
      sample('penny', 'apfel', [], null),
      sample('penny', 'birne', [], null),
    ]);
    expect(variations.size).toBe(0);
  });

  it('пари, що відрізняються кількома словами, не рахуються', () => {
    const variations = learnVariations([
      sample('aldi-sued', 'joghurt erdbeere'),
      sample('aldi-sued', 'pudding vanille'),
      sample('aldi-sued', 'quark kirsche'),
    ]);
    expect(variations.size).toBe(0);
  });

  it('слово, яким відрізняються назви з тим самим GTIN, — шум, а не варіація', () => {
    const noisy = [
      // "becher" єдине відрізняє дві картки мережі (контраст 2) ...
      sample('aldi-sued', 'erdbeere becher'),
      sample('aldi-sued', 'erdbeere'),
      sample('lidl', 'vanille becher'),
      sample('lidl', 'vanille'),
      // ... але три штрихкоди показують, що це той самий товар
      sample('kaufland', 'kirsche becher', ['1']),
      sample('penny', 'kirsche', ['1']),
      sample('kaufland', 'zitrone becher', ['2']),
      sample('penny', 'zitrone', ['2']),
      sample('kaufland', 'apfel becher', ['3']),
      sample('penny', 'apfel', ['3']),
    ];
    expect(learnVariations(noisy).has('becher')).toBe(false);
    // 2 / (2 + 3) = 0,4 — нижче порогу; з м'якшим порогом вага видна
    expect(
      learnVariations(noisy, { minContrast: 2, minWeight: 0 }).get('becher'),
    ).toBeCloseTo(0.4);
  });

  it('числа не є варіаціями', () => {
    const variations = learnVariations([
      sample('aldi-sued', '1664'),
      sample('aldi-sued', 'blanc'),
      sample('aldi-sued', 'rose'),
    ]);
    expect(variations.has('1664')).toBe(false);
    expect(variations.has('blanc')).toBe(true);
  });
});

describe('variationGroup', () => {
  it('бренд + фасування; без фасування — null', () => {
    expect(variationGroup('almighurt', G150)).toBe('almighurt|MASS:150:1');
    expect(variationGroup(null, G150)).toBe('|MASS:150:1');
    expect(
      variationGroup('almighurt', {
        ...G150,
        measure: null,
        netQuantity: null,
      }),
    ).toBeNull();
  });
});

describe('variationMismatch', () => {
  const variations = learnVariations(ALDI);

  it('різні варіації з обох боків — "both"', () => {
    expect(variationMismatch(['erdbeere'], ['stracciatella'], variations)).toBe(
      'both',
    );
  });

  it('варіація лише з одного боку — сторона, де вона є', () => {
    expect(variationMismatch(['erdbeere'], [], variations)).toBe('a');
    expect(variationMismatch([], ['erdbeere'], variations)).toBe('b');
  });

  it('та сама варіація з іншим закінченням — немає розбіжності', () => {
    expect(variationMismatch(['erdbeere'], ['erdbeeren'], variations)).toBe(
      null,
    );
  });

  it('без вивчених варіацій — немає розбіжності', () => {
    expect(variationMismatch(['erdbeere'], ['kirsche'], undefined)).toBe(null);
  });
});

describe('scorePair з вивченими варіаціями (черга модерації, 26.10.2026)', () => {
  const variations = learnVariations(ALDI);
  // ALDI не вказує бренд, тож "almighurt" — звичайне слово назви
  const sued = (flavour: string) =>
    extractFeatures(`Almighurt 150 g, ${flavour}`, null);
  const rangeOffer = extractFeatures('Almighurt', null);

  it('Almighurt Erdbeere і Stracciatella — різні товари', () => {
    expect(
      scorePair(sued('Erdbeere'), sued('Stracciatella'), flat, variations),
    ).toMatchObject({ score: 0, conflict: 'variation' });
    // Без вивчених варіацій "stracciatella" — просто рідкісне слово
    expect(
      scorePair(sued('Erdbeere'), sued('Stracciatella'), flat).conflict,
    ).toBeUndefined();
  });

  it('пропозиція на лінійку проти смаку — нижча схожість, але не конфлікт', () => {
    const plain = scorePair(sued('Erdbeere'), rangeOffer, flat);
    const learned = scorePair(sued('Erdbeere'), rangeOffer, flat, variations);
    expect(learned.conflict).toBeUndefined();
    expect(learned.extraVariation).toBe('a');
    expect(plain.score).toBeGreaterThan(0);
    expect(learned.score).toBeCloseTo(plain.score * 0.85, 2);
  });

  it('той самий смак з обох боків — схожість без змін', () => {
    expect(
      scorePair(sued('Erdbeere'), sued('Erdbeere'), flat, variations),
    ).toMatchObject({ score: 1 });
  });
});

describe('слова вибору: пропозиція на кілька товарів', () => {
  it('розпізнає "oder", "verschiedene", "в асортименті", але не "або"', () => {
    expect(extractFeatures('Grill- oder Ofenkäse').choice).toBe(true);
    expect(
      extractFeatures('Roll-Top Rucksack, verschiedene Farben').choice,
    ).toBe(true);
    expect(
      extractFeatures('Серветки вологі Smile Antibacterial 15шт в асортименті')
        .choice,
    ).toBe(true);
    expect(
      extractFeatures('Хек тушка свіжоморожений або дефростований ваговий')
        .choice,
    ).toBeUndefined();
    expect(extractFeatures('Ofenkäse').choice).toBeUndefined();
  });

  it('пропозиція на вибір і конкретний товар — різні; дві однакові пропозиції — той самий', () => {
    const offer = extractFeatures('Wodka Original oder Citron', 'Gorbatschow');
    const vodka = extractFeatures('Wodka Original', 'Gorbatschow');
    expect(scorePair(offer, vodka, flat)).toMatchObject({
      score: 0,
      conflict: 'choice',
    });
    expect(scorePair(offer, offer, flat).score).toBe(1);
  });
});

describe('CatalogIndex: пропозиція на всю лінійку', () => {
  // Нижчий поріг модерації, щоб пара "Almighurt" ↔ смак до нього діставала
  const thresholds = { ...THRESHOLDS, review: 0.5 };
  let next = 0;
  const listing = (name: string, chainId: string): ListingInput => ({
    id: `l${next++}`,
    chainId,
    country: 'DE',
    barcodes: [],
    quantity: G150,
    features: extractFeatures(name, null),
  });

  function catalog(flavours: string[]) {
    const index = new CatalogIndex(thresholds);
    index.setVariations(
      learnVariations(
        ['erdbeere', 'stracciatella', 'kirsche'].map((f) =>
          sample('aldi-sued', `almighurt ${f}`),
        ),
      ),
    );
    flavours.forEach((flavour, i) => {
      const seed = listing(`Almighurt 150 g, ${flavour}`, 'aldi-sued');
      index.addProduct(`p${i}`, seed.features, 'DE');
      index.addVariant(`v${i}`, `p${i}`, quantityKey(G150));
      index.addName(`v${i}`, seed.features, 'DE', 'aldi-sued');
    });
    return index;
  }

  it('кілька смаків того самого розміру — "Almighurt" не пропонується як жоден із них', () => {
    const decision = catalog(['Erdbeere', 'Stracciatella']).decide(
      listing('Almighurt', 'aldi-nord'),
    );
    expect(decision.kind).toBe('product');
  });

  it('лише один смак — пара йде модератору', () => {
    const decision = catalog(['Erdbeere']).decide(
      listing('Almighurt', 'aldi-nord'),
    );
    expect(decision).toMatchObject({
      kind: 'review',
      candidates: [{ variantId: 'v0', extraVariation: 'b' }],
    });
  });

  it('картка зі смаком не пропонується як пропозиція на лінійку, коли в блоці є інший смак', () => {
    const index = catalog(['Erdbeere']);
    // Пропозиція ALDI Nord на всю лінійку
    const offer = listing('Almighurt', 'aldi-nord');
    index.addProduct('range', offer.features, 'DE');
    index.addVariant('vr', 'range', quantityKey(G150));
    index.addName('vr', offer.features, 'DE', 'aldi-nord');

    // Своя мережа вже має полуницю — "Almighurt" тут лінійка, а не страчателла
    const decision = index.decide(
      listing('Almighurt Stracciatella', 'aldi-sued'),
    );
    expect(decision.kind).toBe('product');

    // Без іншого смаку в блоці пара йде модератору
    const alone = new CatalogIndex(thresholds);
    alone.setVariations(
      learnVariations(
        ['erdbeere', 'stracciatella', 'kirsche'].map((f) =>
          sample('aldi-sued', `almighurt ${f}`),
        ),
      ),
    );
    alone.addProduct('range', offer.features, 'DE');
    alone.addVariant('vr', 'range', quantityKey(G150));
    alone.addName('vr', offer.features, 'DE', 'aldi-nord');
    expect(
      alone.decide(listing('Almighurt Stracciatella', 'aldi-sued')),
    ).toMatchObject({
      kind: 'review',
      candidates: [{ variantId: 'vr', extraVariation: 'a' }],
    });
  });

  it('картка зі смаком знаходить свій смак', () => {
    const decision = catalog(['Erdbeere', 'Stracciatella']).decide(
      listing('Almighurt Erdbeere', 'aldi-nord'),
    );
    expect(decision).toMatchObject({ kind: 'fuzzy', variantId: 'v0' });
  });
});

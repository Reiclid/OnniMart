import { QuantityInfo } from "./catalog-index";
import { extractFeatures } from "./features";
import { scorePair, variationMismatch } from "./similarity";
import { learnVariations, VariationSample, variationGroup } from "./variations";

const G150: QuantityInfo = {
  measure: "MASS",
  netQuantity: 150,
  packCount: 1,
  isWeighted: false,
};
const flat = () => 1;

function sample(
  chainId: string,
  name: string,
  barcodes: string[] = [],
  group: string | null = "almighurt|MASS:150:1",
): VariationSample {
  return { chainId, group, tokens: name.split(" "), barcodes };
}

/** Асортимент ALDI SÜD: одна лінійка в кількох смаках, у двох мережах */
const ALDI = [
  sample("aldi-sued", "erdbeere"),
  sample("aldi-sued", "stracciatella"),
  sample("aldi-sued", "kirsche"),
  sample("aldi-nord", "erdbeere"),
  sample("aldi-nord", "stracciatella"),
];

describe("learnVariations", () => {
  it("слово, що єдине відрізняє дві картки однієї мережі, — варіація", () => {
    const variations = learnVariations(ALDI);
    expect(variations.get("stracciatella")).toBe(1);
    expect(variations.get("erdbeere")).toBe(1);
    // kirsche — лише в одній мережі, контраст 2 (з двома іншими смаками ALDI SÜD)
    expect(variations.get("kirsche")).toBe(1);
  });

  it("один контраст — замало", () => {
    const variations = learnVariations([
      sample("aldi-sued", "erdbeere"),
      sample("aldi-sued", "vanille"),
    ]);
    expect(variations.size).toBe(0);
  });

  it("картки різних мереж, різних груп або без фасування не дають контрасту", () => {
    const variations = learnVariations([
      sample("aldi-sued", "erdbeere"),
      sample("aldi-nord", "vanille"),
      sample("lidl", "kirsche", [], "a|MASS:150:1"),
      sample("lidl", "zitrone", [], "b|MASS:150:1"),
      sample("penny", "apfel", [], null),
      sample("penny", "birne", [], null),
    ]);
    expect(variations.size).toBe(0);
  });

  it("пари, що відрізняються кількома словами, не рахуються", () => {
    const variations = learnVariations([
      sample("aldi-sued", "joghurt erdbeere"),
      sample("aldi-sued", "pudding vanille"),
      sample("aldi-sued", "quark kirsche"),
    ]);
    expect(variations.size).toBe(0);
  });

  it("слово, яким відрізняються назви з тим самим GTIN, — шум, а не варіація", () => {
    const noisy = [
      // "becher" єдине відрізняє дві картки мережі (контраст 2) ...
      sample("aldi-sued", "erdbeere becher"),
      sample("aldi-sued", "erdbeere"),
      sample("lidl", "vanille becher"),
      sample("lidl", "vanille"),
      // ... але три штрихкоди показують, що це той самий товар
      sample("kaufland", "kirsche becher", ["1"]),
      sample("penny", "kirsche", ["1"]),
      sample("kaufland", "zitrone becher", ["2"]),
      sample("penny", "zitrone", ["2"]),
      sample("kaufland", "apfel becher", ["3"]),
      sample("penny", "apfel", ["3"]),
    ];
    expect(learnVariations(noisy).has("becher")).toBe(false);
    // 2 / (2 + 3) = 0,4 — нижче порогу; з м'якшим порогом вага видна
    expect(
      learnVariations(noisy, { minContrast: 2, minWeight: 0 }).get("becher"),
    ).toBeCloseTo(0.4);
  });

  it("числа не є варіаціями", () => {
    const variations = learnVariations([
      sample("aldi-sued", "1664"),
      sample("aldi-sued", "blanc"),
      sample("aldi-sued", "rose"),
    ]);
    expect(variations.has("1664")).toBe(false);
    expect(variations.has("blanc")).toBe(true);
  });
});

describe("variationGroup", () => {
  it("бренд + фасування; без фасування — null", () => {
    expect(variationGroup("almighurt", G150)).toBe("almighurt|MASS:150:1");
    expect(variationGroup(null, G150)).toBe("|MASS:150:1");
    expect(
      variationGroup("almighurt", {
        ...G150,
        measure: null,
        netQuantity: null,
      }),
    ).toBeNull();
  });
});

describe("variationMismatch", () => {
  const variations = learnVariations(ALDI);

  it('різні варіації з обох боків — "both"', () => {
    expect(variationMismatch(["erdbeere"], ["stracciatella"], variations)).toBe(
      "both",
    );
  });

  it('варіація лише з одного боку — "one"', () => {
    expect(variationMismatch(["erdbeere"], [], variations)).toBe("one");
  });

  it("та сама варіація з іншим закінченням — немає розбіжності", () => {
    expect(variationMismatch(["erdbeere"], ["erdbeeren"], variations)).toBe(
      null,
    );
  });

  it("без вивчених варіацій — немає розбіжності", () => {
    expect(variationMismatch(["erdbeere"], ["kirsche"], undefined)).toBe(null);
  });
});

describe("scorePair з вивченими варіаціями (черга модерації, 26.10.2026)", () => {
  const variations = learnVariations(ALDI);
  const sued = (flavour: string) =>
    extractFeatures(`Almighurt 150 g, ${flavour}`, "Almighurt");
  const rangeOffer = extractFeatures("Almighurt", "Almighurt");

  it("Almighurt Erdbeere і Stracciatella — різні товари", () => {
    expect(
      scorePair(sued("Erdbeere"), sued("Stracciatella"), flat, variations),
    ).toMatchObject({ score: 0, conflict: "variation" });
    // Без вивчених варіацій "stracciatella" — просто рідкісне слово
    expect(
      scorePair(sued("Erdbeere"), sued("Stracciatella"), flat).conflict,
    ).toBeUndefined();
  });

  it("пропозиція на лінійку проти смаку — нижча схожість, але не конфлікт", () => {
    const plain = scorePair(sued("Erdbeere"), rangeOffer, flat);
    const learned = scorePair(sued("Erdbeere"), rangeOffer, flat, variations);
    expect(learned.conflict).toBeUndefined();
    expect(learned.score).toBeCloseTo(plain.score * 0.85, 2);
  });

  it("той самий смак з обох боків — схожість без змін", () => {
    expect(
      scorePair(sued("Erdbeere"), sued("Erdbeere"), flat, variations),
    ).toMatchObject({ score: 1 });
  });
});

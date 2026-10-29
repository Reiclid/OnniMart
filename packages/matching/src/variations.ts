import { QuantityInfo, quantityKey } from "./catalog-index";

/**
 * Варіації, вивчені з даних (PRD-30, docs/08-variations.md): слово → вага 0..1.
 * Висока вага — слово відрізняє різновиди одного товару (erdbeere, куркою, gouda).
 */
export type Variations = Map<string, number>;

/** Картка для навчання: слова назви без бренду й фасування */
export interface VariationSample {
  chainId: string;
  /** Бренд + фасування ("coca-cola|VOLUME:500:1"); null — фасування невідоме, картка лише для штрихкодів */
  group: string | null;
  tokens: string[];
  barcodes: string[];
}

/** Група для контрасту: бренд + фасування; фасування невідоме — null (так само як блоки зіставлення) */
export function variationGroup(
  brand: string | null,
  quantity: QuantityInfo,
): string | null {
  const key = quantityKey(quantity);
  return key === "none" ? null : `${brand ?? ""}|${key}`;
}

export const VARIATION_RULES = {
  /** Скільки разів слово має бути єдиною відмінністю двох карток однієї мережі */
  minContrast: 2,
  /** Від цієї ваги слово — варіація */
  minWeight: 0.75,
};

/**
 * Вчить варіації за двома властивостями предметної області:
 *   - мережа не продає той самий товар двічі: дві її картки одного бренду й фасування,
 *     що відрізняються одним словом, — різні товари, і це слово — варіація (контраст);
 *   - той самий GTIN у різних мережах — той самий товар: слова, якими відрізняються
 *     такі назви, — шум (упаковка, маркетинг), а не варіація.
 * Вага v = контраст / (контраст + збіги за GTIN). Повертає лише слова з
 * контрастом ≥ minContrast і вагою ≥ minWeight.
 */
export function learnVariations(
  samples: VariationSample[],
  rules = VARIATION_RULES,
): Variations {
  const contrast = new Map<string, number>();
  const noise = new Map<string, number>();
  const add = (counts: Map<string, number>, word: string) =>
    counts.set(word, (counts.get(word) ?? 0) + 1);

  // Контраст: різні назви в межах мережа + бренд + фасування
  const groups = new Map<string, Set<string>>();
  for (const s of samples) {
    if (s.group === null) continue;
    const key = `${s.chainId}|${s.group}`;
    const names = groups.get(key) ?? new Set<string>();
    names.add(unique(s.tokens).sort().join(" "));
    groups.set(key, names);
  }
  for (const names of groups.values()) {
    const list = [...names].map((n) => (n ? n.split(" ") : []));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const left = difference(list[i], list[j]);
        const right = difference(list[j], list[i]);
        // Чиста пара: одне слово проти одного або проти нічого
        if (left.length + right.length === 0) continue;
        if (left.length > 1 || right.length > 1) continue;
        for (const word of [...left, ...right]) add(contrast, word);
      }
    }
  }

  // Протилежний доказ: різні мережі, той самий GTIN
  const byGtin = new Map<string, Map<string, string[]>>();
  for (const s of samples) {
    for (const gtin of s.barcodes) {
      const chains = byGtin.get(gtin) ?? new Map<string, string[]>();
      if (!chains.has(s.chainId)) chains.set(s.chainId, unique(s.tokens));
      byGtin.set(gtin, chains);
    }
  }
  for (const chains of byGtin.values()) {
    const list = [...chains.values()];
    const seen = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        for (const word of [
          ...difference(list[i], list[j]),
          ...difference(list[j], list[i]),
        ]) {
          seen.add(word);
        }
      }
    }
    for (const word of seen) add(noise, word);
  }

  const variations: Variations = new Map();
  for (const [word, c] of contrast) {
    if (c < rules.minContrast || /\d/.test(word)) continue;
    const weight = c / (c + (noise.get(word) ?? 0));
    if (weight >= rules.minWeight) variations.set(word, weight);
  }
  return variations;
}

function unique(words: string[]): string[] {
  return [...new Set(words)];
}

function difference(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((w) => !set.has(w));
}

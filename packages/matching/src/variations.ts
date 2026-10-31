import { QuantityInfo, quantityKey } from './catalog-index';

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

/**
 * Група для контрасту: бренд + фасування. null — фасування невідоме або товар
 * ваговий: вагові овочі й мʼясо без бренду в мережі утворюють одну групу, і
 * "капуста" / "морква" виглядали б смаками.
 */
export function variationGroup(
  brand: string | null,
  quantity: QuantityInfo,
): string | null {
  const key = quantityKey(quantity);
  return key === 'none' || quantity.isWeighted ? null : `${brand ?? ''}|${key}`;
}

export const VARIATION_RULES = {
  /** Скільки разів слово має бути єдиною відмінністю двох карток однієї мережі */
  minContrast: 2,
  /** Від цієї ваги слово — варіація */
  minWeight: 0.75,
};

/** Докази для одного слова: скільки разів воно варіація і скільки — шум */
export interface VariationEvidence {
  /** Скільки разів слово — єдина відмінність двох карток однієї мережі (слово ↔ слово) */
  contrast: number;
  /** У скількох GTIN слово відрізняє назви того самого товару в різних мережах */
  noise: number;
  /** contrast / (contrast + noise) */
  weight: number;
}

/**
 * Рахує докази за двома властивостями предметної області:
 *   - мережа не продає той самий товар двічі: дві її картки одного бренду й фасування,
 *     де одне слово замінене іншим, — різні товари, і ці слова — варіації (контраст);
 *   - той самий GTIN у різних мережах — той самий товар: слова, якими відрізняються
 *     такі назви, — шум (упаковка, маркетинг), а не варіація.
 * Повертає всі слова з контрастом (без чисел), зокрема ті, що не пройдуть пороги, —
 * для перегляду в адмінці.
 */
export function variationEvidence(
  samples: VariationSample[],
): Map<string, VariationEvidence> {
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
    names.add(unique(s.tokens).sort().join(' '));
    groups.set(key, names);
  }
  for (const names of groups.values()) {
    const list = [...names].map((n) => (n ? n.split(' ') : []));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const left = difference(list[i], list[j]);
        const right = difference(list[j], list[i]);
        // Чиста пара: одне слово замість іншого ("erdbeere" ↔ "vanille").
        // "Слово проти нічого" не рахується: це здебільшого уточнення
        // ("Капуста" / "Капуста молода"), а не смак
        if (left.length !== 1 || right.length !== 1) continue;
        add(contrast, left[0]);
        add(contrast, right[0]);
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

  const evidence = new Map<string, VariationEvidence>();
  for (const [word, c] of contrast) {
    if (/\d/.test(word)) continue;
    const n = noise.get(word) ?? 0;
    evidence.set(word, { contrast: c, noise: n, weight: c / (c + n) });
  }
  return evidence;
}

/** Чи проходить слово пороги навчання */
export function isLearned(
  e: VariationEvidence,
  rules: typeof VARIATION_RULES = VARIATION_RULES,
): boolean {
  return e.contrast >= rules.minContrast && e.weight >= rules.minWeight;
}

/**
 * Вчить варіації (див. variationEvidence): лише слова з контрастом ≥ minContrast
 * і вагою ≥ minWeight.
 */
export function learnVariations(
  samples: VariationSample[],
  rules: typeof VARIATION_RULES = VARIATION_RULES,
): Variations {
  const variations: Variations = new Map();
  for (const [word, e] of variationEvidence(samples)) {
    if (isLearned(e, rules)) variations.set(word, e.weight);
  }
  return variations;
}

/** Ручне рішення модератора про слово (таблиця variation_overrides) */
export interface VariationOverride {
  word: string;
  /** ADD — варіація завжди (вага 1), REMOVE — ніколи */
  action: 'ADD' | 'REMOVE';
}

/** Вивчені варіації з ручними рішеннями поверх: рішення модератора важливіше за дані */
export function applyOverrides(
  learned: Variations,
  overrides: VariationOverride[],
): Variations {
  if (overrides.length === 0) return learned;
  const variations: Variations = new Map(learned);
  for (const { word, action } of overrides) {
    if (action === 'ADD') variations.set(word, 1);
    else variations.delete(word);
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

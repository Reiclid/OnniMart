import type { QuantityInfo } from './catalog-index';
import type { NameFeatures } from './features';
import { formatQuantity } from './normalization/quantity';
import { slugify } from './normalization/text';

/**
 * Лінійка бренду — бренд і перші два слова назви без смаків:
 * "Паста сиркова … банан" і "… персик" → "Яготинське для дітей · паста сиркова";
 * "Coca-Cola Zero" і "Coca-Cola Cherry" → "Coca-Cola".
 */
function lineBase(features: NameFeatures) {
  const flavours = new Set(features.flavours.map((t) => t.norm));
  return features.tokens.filter((t) => !flavours.has(t.norm)).slice(0, 2);
}

/**
 * Чим товар відрізняється всередині лінійки: слова поза назвою лінійки
 * (смак, "Спорт") і ознаки — "банан · 3,9%", "спорт · негазована", "Zero".
 */
export function variantLabelOf(features: NameFeatures): string | null {
  const base = new Set(lineBase(features).map((t) => t.norm));
  const extra = features.tokens
    .filter((t) => !base.has(t.norm))
    .slice(0, 4)
    .map((t) => t.surface);
  return [...extra, ...features.attributeLabels].join(' · ') || null;
}

/** Ключ і назва лінійки бренду для товару з такими ознаками */
export function lineOf(features: NameFeatures, brandName: string) {
  const base = lineBase(features);
  return {
    slug: slugify(`${features.brand} ${base.map((t) => t.norm).join(' ')}`),
    name: base.length
      ? `${brandName} · ${base.map((t) => t.surface).join(' ')}`
      : brandName,
  };
}

/** Підпис фасування для інтерфейсу: "0,5 л", "6 × 0,33 л" або "фасування не вказано" */
export function variantLabel(quantity: QuantityInfo): string {
  const { measure, netQuantity, packCount, isWeighted } = quantity;
  return measure && netQuantity
    ? formatQuantity({ measure, netQuantity, packCount, isWeighted })
    : 'фасування не вказано';
}

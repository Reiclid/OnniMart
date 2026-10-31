/**
 * PRD-32 перевірки якості даних без БД — ті, що вибрало дослідження
 * (docs/09-data-quality.md §6): спільні для `bun run quality:research` і /admin/quality.
 */
import { median, OUTLIER_RULES } from './outliers';

/** Активна картка в наявності з ціною */
export interface QualityRow {
  id: string;
  chain: string;
  country: string;
  name: string;
  measure: string | null;
  /** Фасування в базових одиницях (г / мл / шт) */
  qty: number | null;
  pack: number;
  weighted: boolean;
  price: number;
  regular: number | null;
  /** Ціна за кг / л / шт */
  unit: number | null;
  variantId: string | null;
  productId: string | null;
  category: string | null;
}

/** Пороги, вибрані дослідженням (docs/09-data-quality.md §4–6) */
export const QUALITY_LIMITS = {
  /** Фасування менше 5 г / мл — майже завжди помилка розбору («1 kg» як 1 г, доза «500 мг») */
  tinyPack: 5,
  /** Ціна ÷ медіана ціни фасування в інших мережах країни: далі ×1,6 — інше фасування в товарі */
  variantRatio: 1.6,
  /** Знижка понад 70 % — підозріла */
  maxDiscount: 0.7,
  /** Стрибок ціни між знімками картки більше ніж утричі */
  jump: 3,
};

const ln = Math.log;

/** Група для ціни за одиницю: категорія + країна + одиниця */
export const unitGroup = (r: QualityRow) =>
  r.category && r.measure ? `${r.category}|${r.country}|${r.measure}` : null;

export const logUnit = (r: QualityRow) =>
  r.unit && r.unit > 0 ? ln(r.unit) : null;

/**
 * Фасування (г / мл) штучного товару: усе фасування, а не одна штука — «Чай 2 г × 20»
 * важить 40 г і не крихітний. null — ваговий, штуки або невідомо.
 */
export function packSize(r: QualityRow): number | null {
  if (r.qty === null || r.measure === 'COUNT' || r.weighted) return null;
  return r.qty;
}

export function isTinyPack(r: QualityRow): boolean {
  const size = packSize(r);
  return size !== null && size < QUALITY_LIMITS.tinyPack;
}

/** Частка знижки 0..1; null — акції немає */
export function discountOf(r: QualityRow): number | null {
  return r.regular !== null && r.regular > 0
    ? (r.regular - r.price) / r.regular
    : null;
}

/** Закреслена ціна ≤ поточної або знижка > 70 % */
export function isBadDiscount(r: QualityRow): boolean {
  const d = discountOf(r);
  return d !== null && (d <= 0 || d > QUALITY_LIMITS.maxDiscount);
}

/** Ціна картки ÷ медіана цін інших карток того самого фасування в цій країні */
export function variantRatios(rows: QualityRow[]): Map<string, number> {
  const byVariant = new Map<string, QualityRow[]>();
  for (const r of rows) {
    if (!r.variantId) continue;
    const key = `${r.variantId}|${r.country}`;
    byVariant.set(key, [...(byVariant.get(key) ?? []), r]);
  }
  const ratios = new Map<string, number>();
  for (const group of byVariant.values()) {
    if (group.length < 2) continue;
    for (const r of group) {
      const others = group.filter((o) => o.id !== r.id).map((o) => o.price);
      ratios.set(r.id, r.price / median(others));
    }
  }
  return ratios;
}

export function isRatioOff(ratio: number, limit = QUALITY_LIMITS.variantRatio) {
  return Math.abs(ln(ratio)) > ln(limit);
}

export interface Fit {
  slope: number;
  intercept: number;
}

/** Скільки пар точок брати для нахилу Theil–Sen у великій групі */
const MAX_PAIRS = 200_000;
/** Пари з майже однаковим розміром (0,7 і 0,75 л) не дають нахилу */
const MIN_DX = Math.log(1.05);

/**
 * Нахил Theil–Sen: медіана нахилів усіх пар точок з різним x (стійкий до викидів).
 * Пряма через медіани половин ламалась, коли більшість точок одного розміру
 * (пляшки 0,7 / 0,75 л): нахил −9 замість ≈ −0,3.
 */
export function theilSen(xs: number[], ys: number[]): Fit {
  const n = xs.length;
  const total = (n * (n - 1)) / 2;
  const stride = Math.max(1, Math.ceil(total / MAX_PAIRS));
  const slopes: number[] = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (k++ % stride !== 0) continue;
      const dx = xs[j] - xs[i];
      if (Math.abs(dx) >= MIN_DX) slopes.push((ys[j] - ys[i]) / dx);
    }
  }
  const slope = slopes.length ? median(slopes) : 0;
  return { slope, intercept: median(ys.map((y, i) => y - slope * xs[i])) };
}

/** Залишки log(ціна за кг) після прямої Theil–Sen від log(розмір) у кожній групі unitGroup */
export function logLogResiduals(rows: QualityRow[]): {
  residuals: Map<string, number>;
  fits: Map<string, Fit>;
} {
  const groups = new Map<string, QualityRow[]>();
  for (const r of rows) {
    const g = unitGroup(r);
    if (!g || !r.unit || !r.qty || r.weighted) continue;
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  const residuals = new Map<string, number>();
  const fits = new Map<string, Fit>();
  for (const [key, group] of groups) {
    if (group.length < OUTLIER_RULES.minGroup) continue;
    const xs = group.map((r) => ln(r.qty! / r.pack));
    const ys = group.map((r) => ln(r.unit!));
    const fit = theilSen(xs, ys);
    fits.set(key, fit);
    group.forEach((r, i) =>
      residuals.set(r.id, ys[i] - (fit.intercept + fit.slope * xs[i])),
    );
  }
  return { residuals, fits };
}

export interface Box {
  n: number;
  /** 5-й перцентиль (вуса), квартилі, медіана, 95-й перцентиль */
  p5: number;
  q1: number;
  median: number;
  q3: number;
  p95: number;
}

/** Квантиль з лінійною інтерполяцією; values відсортовані */
function quantile(sorted: number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

export function boxOf(values: number[]): Box | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p5: quantile(sorted, 0.05),
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
  };
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

/** Гістограма за межами кошиків edges (n+1 межа → n кошиків); крайні кошики збирають усе за межами */
export function histogram(values: number[], edges: number[]): Bin[] {
  const bins = edges
    .slice(0, -1)
    .map((from, i) => ({ from, to: edges[i + 1], count: 0 }));
  for (const v of values) {
    let i = bins.findIndex((b) => v < b.to);
    if (i < 0) i = bins.length - 1;
    bins[i].count++;
  }
  return bins;
}

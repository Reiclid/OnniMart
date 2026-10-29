/**
 * PRD-32 правило викидів без БД: медіана й MAD усередині групи замість середнього й σ —
 * один хибний пункт (ціна ×100) не зсуває межу для решти групи.
 * Модифікований z (Iglewicz–Hoaglin): z = 0,6745 · (x − медіана) / MAD; |z| > 3,5 — викид.
 */

export const OUTLIER_RULES = {
  /** Від цього |z| точка — викид */
  limit: 3.5,
  /** Менші групи не оцінюються: медіана кількох точок ненадійна */
  minGroup: 10,
};

export interface Spread {
  median: number;
  /** Масштаб розкиду: MAD / 0,6745 (≈ σ для нормального розподілу); 0 — усі однакові */
  scale: number;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Медіана й масштаб розкиду. Якщо більше половини значень однакові (MAD = 0),
 * масштаб — середнє абсолютне відхилення · 1,2533 (так само ≈ σ).
 */
export function spread(values: number[]): Spread {
  const m = median(values);
  const deviations = values.map((v) => Math.abs(v - m));
  const mad = median(deviations);
  if (mad > 0) return { median: m, scale: mad / 0.6745 };
  const mean = deviations.reduce((s, d) => s + d, 0) / values.length;
  return { median: m, scale: mean * 1.2533 };
}

export function zScore(value: number, s: Spread): number {
  if (s.scale === 0) return value === s.median ? 0 : Infinity;
  return (value - s.median) / s.scale;
}

export interface Outlier<T> {
  item: T;
  group: string;
  z: number;
}

/**
 * Викиди за значенням усередині груп. value — те, що порівнюється (для цін —
 * логарифм: ціна ×100 і ÷100 однаково далекі від медіани). Точки без групи чи
 * значення (null) пропускаються.
 */
export function findOutliers<T>(
  items: T[],
  groupOf: (item: T) => string | null,
  valueOf: (item: T) => number | null,
  rules = OUTLIER_RULES,
): Outlier<T>[] {
  const groups = new Map<string, { item: T; value: number }[]>();
  for (const item of items) {
    const group = groupOf(item);
    const value = valueOf(item);
    if (group === null || value === null || !Number.isFinite(value)) continue;
    const list = groups.get(group) ?? [];
    list.push({ item, value });
    groups.set(group, list);
  }
  const outliers: Outlier<T>[] = [];
  for (const [group, list] of groups) {
    if (list.length < rules.minGroup) continue;
    const s = spread(list.map((p) => p.value));
    for (const { item, value } of list) {
      const z = zScore(value, s);
      if (Math.abs(z) > rules.limit) outliers.push({ item, group, z });
    }
  }
  return outliers.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

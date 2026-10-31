/**
 * /admin/quality без БД: графіки, вибрані дослідженням (docs/09-data-quality.md §6),
 * як агрегати + списки позначених карток (а не всі рядки).
 */
import {
  Box,
  boxOf,
  discountOf,
  histogram,
  isBadDiscount,
  isRatioOff,
  isTinyPack,
  logLogResiduals,
  logUnit,
  packSize,
  QUALITY_LIMITS,
  QualityRow,
  unitGroup,
  variantRatios,
} from './checks';
import { findOutliers } from './outliers';

/** Позначена картка: куди перейти, щоб виправити */
export interface FlaggedItem {
  listingId: string;
  productId: string | null;
  chain: string;
  name: string;
  /** Значення, через яке позначено (ціна за кг, розмір, відношення, знижка…) */
  value: number;
  /** З чим порівнювали (медіана групи, ціна в інших мережах, закреслена ціна) */
  reference: number | null;
  /** Група або пояснення */
  group: string | null;
}

export interface BoxRow extends Box {
  key: string;
  label: string;
  /** Позначені точки цього рядка (лише видимі за фільтром мережі) */
  flagged: FlaggedItem[];
}

export interface ScatterPoint {
  listingId: string;
  chain: string;
  name: string;
  size: number;
  unit: number;
  outlier: boolean;
}

export interface ReportOptions {
  /** Лише ця мережа у списках і графіках по мережах; групи рахуються по всій країні */
  chain?: string;
  /** Група для log–log (unitGroup); без неї — група з найбільшою кількістю викидів */
  group?: string;
  /** Назви категорій для підписів груп: slug → назва */
  categoryNames: Map<string, string>;
}

const LIST_LIMIT = 100;
const GROUPS_LIMIT = 25;
const PER_GROUP_LIMIT = 20;
const SCATTER_LIMIT = 1500;
const UNIT: Record<string, string> = { MASS: 'кг', VOLUME: 'л', COUNT: 'шт' };

/** Межі гістограми відношення цін: 2^(k/4), k = −8…8 → ×0,25 … ×4 */
export const RATIO_EDGES = Array.from({ length: 17 }, (_, i) =>
  Math.pow(2, (i - 8) / 4),
);

export function groupLabel(key: string, names: Map<string, string>): string {
  const [category, country, measure] = key.split('|');
  return `${names.get(category) ?? category} · ${country} · за ${UNIT[measure] ?? measure}`;
}

const item = (
  r: QualityRow,
  value: number,
  reference: number | null,
  group: string | null,
): FlaggedItem => ({
  listingId: r.id,
  productId: r.productId,
  chain: r.chain,
  name: r.name,
  value,
  reference,
  group,
});

export function buildReport(rows: QualityRow[], options: ReportOptions) {
  const visible = (r: QualityRow) =>
    !options.chain || r.chain === options.chain;
  const names = options.categoryNames;

  // 1. Ціна за одиницю по групах, лог. шкала, медіана й MAD
  const unitOutliers = findOutliers(rows, unitGroup, logUnit);
  const byGroup = new Map<string, QualityRow[]>();
  for (const r of rows) {
    const g = unitGroup(r);
    if (g && r.unit) byGroup.set(g, [...(byGroup.get(g) ?? []), r]);
  }
  const medians = new Map(
    [...byGroup].map(([g, list]) => [
      g,
      boxOf(list.map((r) => r.unit!))!.median,
    ]),
  );
  const unitFlagged: FlaggedItem[] = [];
  const flaggedByGroup = new Map<string, FlaggedItem[]>();
  for (const o of unitOutliers) {
    if (!visible(o.item)) continue;
    const flagged = item(
      o.item,
      o.item.unit!,
      medians.get(o.group)!,
      groupLabel(o.group, names),
    );
    unitFlagged.push(flagged);
    flaggedByGroup.set(o.group, [
      ...(flaggedByGroup.get(o.group) ?? []),
      flagged,
    ]);
  }
  const unitGroups = [...byGroup]
    .filter(([, list]) => list.length >= 10)
    .map(([key, list]): BoxRow => ({
      key,
      label: groupLabel(key, names),
      ...boxOf(list.map((r) => r.unit!))!,
      flagged: (flaggedByGroup.get(key) ?? []).slice(0, PER_GROUP_LIMIT),
    }))
    .sort(
      (a, b) =>
        (flaggedByGroup.get(b.key)?.length ?? 0) -
          (flaggedByGroup.get(a.key)?.length ?? 0) || b.n - a.n,
    )
    .slice(0, GROUPS_LIMIT);

  // 2. Розмір упаковки по мережах, межа 5 г / мл
  const chains = [...new Set(rows.filter(visible).map((r) => r.chain))].sort();
  const tiny = rows
    .filter((r) => visible(r) && isTinyPack(r))
    .map((r) =>
      item(r, packSize(r)!, null, r.measure === 'VOLUME' ? 'мл' : 'г'),
    );
  const packChains = chains
    .map((chain): BoxRow | null => {
      const sizes = rows
        .filter((r) => r.chain === chain)
        .map(packSize)
        .filter((s): s is number => s !== null && s > 0);
      const box = boxOf(sizes);
      return box
        ? {
            key: chain,
            label: chain,
            ...box,
            flagged: tiny.filter((t) => t.chain === chain),
          }
        : null;
    })
    .filter((b): b is BoxRow => b !== null);

  // 3. Ціна ÷ медіана ціни фасування в інших мережах країни
  const ratios = variantRatios(rows);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ratioFlagged = [...ratios]
    .filter(([id, q]) => isRatioOff(q) && visible(byId.get(id)!))
    .sort(([, a], [, b]) => Math.abs(Math.log(b)) - Math.abs(Math.log(a)))
    .map(([id, q]) => {
      const r = byId.get(id)!;
      return item(r, q, r.price / q, null);
    });

  // 4. Знижки по мережах
  const discountChains = chains
    .map((chain): BoxRow | null => {
      const list = rows.filter((r) => r.chain === chain && r.regular !== null);
      const box = boxOf(list.map((r) => 100 * discountOf(r)!));
      return box
        ? {
            key: chain,
            label: chain,
            ...box,
            flagged: list
              .filter(isBadDiscount)
              .map((r) => item(r, 100 * discountOf(r)!, r.regular, null)),
          }
        : null;
    })
    .filter((b): b is BoxRow => b !== null);

  // 5. Ціна за одиницю від розміру, log–log, для однієї групи
  const { residuals, fits } = logLogResiduals(rows);
  const fitted = rows.filter((r) => residuals.has(r.id));
  const residualOutliers = findOutliers(fitted, unitGroup, (r) =>
    residuals.get(r.id)!,
  );
  const outlierIds = new Set(residualOutliers.map((o) => o.item.id));
  const residualCounts = new Map<string, number>();
  for (const o of residualOutliers) {
    if (visible(o.item)) {
      residualCounts.set(o.group, (residualCounts.get(o.group) ?? 0) + 1);
    }
  }
  const scatterGroups = [...fits.keys()]
    .map((key) => ({
      key,
      label: groupLabel(key, names),
      outliers: residualCounts.get(key) ?? 0,
    }))
    .sort((a, b) => b.outliers - a.outliers || a.label.localeCompare(b.label));
  const group =
    options.group && fits.has(options.group)
      ? options.group
      : (scatterGroups[0]?.key ?? null);
  const points: ScatterPoint[] = group
    ? fitted
        .filter((r) => unitGroup(r) === group)
        .slice(0, SCATTER_LIMIT)
        .map((r) => ({
          listingId: r.id,
          chain: r.chain,
          name: r.name,
          size: r.qty! / r.pack,
          unit: r.unit!,
          outlier: outlierIds.has(r.id) && visible(r),
        }))
    : [];

  // 6. Картки без ознаки, по мережах (%)
  const pct = (list: QualityRow[], f: (r: QualityRow) => boolean) =>
    Math.round((100 * list.filter(f).length) / list.length);
  const completeness = chains.map((chain) => {
    const list = rows.filter((r) => r.chain === chain);
    return {
      chain,
      listings: list.length,
      noUnitPrice: pct(list, (r) => r.unit === null),
      noQuantity: pct(list, (r) => r.qty === null),
      noCategory: pct(list, (r) => r.category === null),
      unmatched: pct(list, (r) => r.variantId === null),
    };
  });

  return {
    analysed: rows.filter(visible).length,
    unitPrice: {
      groups: unitGroups,
      flagged: unitFlagged.slice(0, LIST_LIMIT),
      total: unitFlagged.length,
    },
    packSize: {
      chains: packChains,
      flagged: tiny.slice(0, LIST_LIMIT),
      total: tiny.length,
      limit: QUALITY_LIMITS.tinyPack,
    },
    variantRatio: {
      bins: histogram(
        [...ratios].filter(([id]) => visible(byId.get(id)!)).map(([, q]) => q),
        RATIO_EDGES,
      ),
      flagged: ratioFlagged.slice(0, LIST_LIMIT),
      total: ratioFlagged.length,
      compared: ratios.size,
      limit: QUALITY_LIMITS.variantRatio,
    },
    discount: {
      chains: discountChains,
      total: discountChains.reduce((s, c) => s + c.flagged.length, 0),
      limit: QUALITY_LIMITS.maxDiscount * 100,
    },
    scatter: {
      groups: scatterGroups,
      group,
      fit: group ? fits.get(group)! : null,
      points,
    },
    completeness,
  };
}

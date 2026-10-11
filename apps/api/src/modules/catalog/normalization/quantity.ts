export type Measure = 'MASS' | 'VOLUME' | 'COUNT';

export interface ParsedQuantity {
  measure: Measure;
  /** Загальна кількість у базових одиницях (г / мл / шт): 6 × 330 мл → 1980 */
  netQuantity: number;
  /** Кількість одиниць в упаковці: 6 × 0,33 л → 6 */
  packCount: number;
  /** Ваговий товар — ціна вказана за 1 кг */
  isWeighted: boolean;
}

const UNITS: Record<string, { measure: Measure; factor: number }> = {
  мг: { measure: 'MASS', factor: 0.001 },
  mg: { measure: 'MASS', factor: 0.001 },
  г: { measure: 'MASS', factor: 1 },
  гр: { measure: 'MASS', factor: 1 },
  g: { measure: 'MASS', factor: 1 },
  gr: { measure: 'MASS', factor: 1 },
  кг: { measure: 'MASS', factor: 1000 },
  kg: { measure: 'MASS', factor: 1000 },
  мл: { measure: 'VOLUME', factor: 1 },
  ml: { measure: 'VOLUME', factor: 1 },
  cl: { measure: 'VOLUME', factor: 10 },
  л: { measure: 'VOLUME', factor: 1000 },
  l: { measure: 'VOLUME', factor: 1000 },
  літр: { measure: 'VOLUME', factor: 1000 },
  літра: { measure: 'VOLUME', factor: 1000 },
  літри: { measure: 'VOLUME', factor: 1000 },
  літрів: { measure: 'VOLUME', factor: 1000 },
  liter: { measure: 'VOLUME', factor: 1000 },
  шт: { measure: 'COUNT', factor: 1 },
  pcs: { measure: 'COUNT', factor: 1 },
  stk: { measure: 'COUNT', factor: 1 },
  stück: { measure: 'COUNT', factor: 1 },
};

// Довші одиниці раніше коротших, щоб "кг" не розпізнався як "г", а "літра" як "л"
const UNIT = `(${Object.keys(UNITS)
  .sort((a, b) => b.length - a.length)
  .join('|')})`;
const NUMBER = '(\\d+(?:[.,]\\d+)?)';
// Після одиниці не повинна йти літера: "4 гриби" — не "4 г"
const UNIT_END = '(?![\\p{L}])';
// Латинська x, кирилична х, знак множення, зірочка
const TIMES = '\\s*[xх×*]\\s*';
// Між числом і одиницею буває дефіс: "1,5-L-Flasche", "1-Liter-Flasche"
const GAP = '\\s*-?\\s*';

const MULTIPACK = new RegExp(
  `(?<![\\p{L}\\d])(\\d+)${TIMES}${NUMBER}${GAP}${UNIT}${UNIT_END}`,
  'iu',
);
const MULTIPACK_REVERSED = new RegExp(
  `(?<![\\p{L}\\d.,])${NUMBER}${GAP}${UNIT}${TIMES}(\\d+)(?:\\s*шт)?${UNIT_END}`,
  'iu',
);
const SINGLE = new RegExp(
  `(?<![\\p{L}\\d.,])${NUMBER}${GAP}${UNIT}${UNIT_END}`,
  'giu',
);
const WEIGHTED =
  /(вагов|ваг\.|на\s+вагу|\/\s*кг|за\s+1?\s*кг|\/\s*kg|je\s+kg|per\s+kg)/iu;

function toNumber(raw: string): number {
  return Number(raw.replace(',', '.'));
}

function unitOf(raw: string) {
  return UNITS[raw.toLowerCase()];
}

/**
 * Розпізнає вагу / об'єм / кількість у назві товару.
 *
 *   "Напій Coca-Cola 0,5л"        → VOLUME 500
 *   "Пиво Corona 6х0,33 л"        → VOLUME 1980, packCount 6
 *   "Сир Гауда ваговий"           → MASS 1000, isWeighted (ціна за 1 кг)
 *   "Яйця курячі С1 10 шт"        → COUNT 10
 */
export function parseQuantity(name: string): ParsedQuantity | null {
  const isWeighted = WEIGHTED.test(name);

  const multi = MULTIPACK.exec(name);
  if (multi) {
    const unit = unitOf(multi[3]);
    const packCount = Number(multi[1]);
    return {
      measure: unit.measure,
      netQuantity: round3(packCount * toNumber(multi[2]) * unit.factor),
      packCount,
      isWeighted: false,
    };
  }

  const reversed = MULTIPACK_REVERSED.exec(name);
  if (reversed) {
    const unit = unitOf(reversed[2]);
    const packCount = Number(reversed[3]);
    return {
      measure: unit.measure,
      netQuantity: round3(packCount * toNumber(reversed[1]) * unit.factor),
      packCount,
      isWeighted: false,
    };
  }

  const matches = [...name.matchAll(SINGLE)].map((m) => ({
    value: toNumber(m[1]),
    unit: unitOf(m[2]),
  }));
  // Вага/об'єм важливіші за штуки: "Сосиски 6 шт 300 г" → 300 г
  const best =
    matches.find((m) => m.unit.measure !== 'COUNT') ?? matches[0] ?? null;

  if (isWeighted) {
    // Для вагового товару ціна на сайті — за 1 кг, незалежно від цифр у назві
    return { measure: 'MASS', netQuantity: 1000, packCount: 1, isWeighted };
  }
  if (!best || best.value <= 0) return null;

  return {
    measure: best.unit.measure,
    netQuantity: round3(best.value * best.unit.factor),
    packCount: 1,
    isWeighted: false,
  };
}

/**
 * Ціна за 1 кг / 1 л (для MASS / VOLUME) або за 1 шт (для COUNT).
 */
export function computeUnitPrice(
  price: number,
  quantity: ParsedQuantity | null,
): number | null {
  if (!quantity || quantity.netQuantity <= 0 || price <= 0) return null;
  if (quantity.isWeighted) return round2(price);
  if (quantity.measure === 'COUNT') {
    return round2(price / quantity.netQuantity);
  }
  return round2((price / quantity.netQuantity) * 1000);
}

/** Підпис для інтерфейсу: "0,5 л", "6 × 0,33 л", "400 г", "10 шт" */
export function formatQuantity(quantity: ParsedQuantity): string {
  if (quantity.isWeighted) return 'на вагу, 1 кг';
  const single = quantity.netQuantity / quantity.packCount;
  const label = formatSingle(quantity.measure, single);
  return quantity.packCount > 1 ? `${quantity.packCount} × ${label}` : label;
}

function formatSingle(measure: Measure, value: number): string {
  const decimal = (n: number) => String(round3(n)).replace('.', ',');
  if (measure === 'COUNT') return `${decimal(value)} шт`;
  if (measure === 'MASS') {
    return value >= 1000
      ? `${decimal(value / 1000)} кг`
      : `${decimal(value)} г`;
  }
  // Напої від 250 мл мережі підписують у літрах: "0,355 л", "1,98 л"
  return value >= 250 ? `${decimal(value / 1000)} л` : `${decimal(value)} мл`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

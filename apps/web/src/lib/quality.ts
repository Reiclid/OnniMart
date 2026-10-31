/** Поділки логарифмічної шкали: 1, 2, 5 × 10^k у межах [min, max]; якщо їх забагато — лише 10^k */
export function logTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  for (
    let k = Math.floor(Math.log10(min));
    k <= Math.ceil(Math.log10(max));
    k++
  ) {
    for (const m of [1, 2, 5]) {
      const t = m * 10 ** k;
      if (t >= min && t <= max) ticks.push(t);
    }
  }
  return ticks.length > 12
    ? ticks.filter((t) => Number.isInteger(Math.log10(t)))
    : ticks;
}

/** Коротке число для осі й підказок: 0,05 · 2,5 · 120 · 1,5 тис. · 2 млн */
export function shortNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${trim(value / 1e6)} млн`;
  if (abs >= 1e4) return `${trim(value / 1e3)} тис.`;
  if (abs >= 100) return String(Math.round(value));
  return trim(value);
}

function trim(value: number): string {
  return String(Number(value.toPrecision(3))).replace(".", ",");
}

/** Відношення цін: ×0,5 · ×1,19 · ×4 */
export function ratioLabel(ratio: number): string {
  return `×${String(Number(ratio.toFixed(2))).replace(".", ",")}`;
}

/** Поділки звичайної шкали: крок 1, 2 або 5 × 10^k, ≈ 5–10 поділок */
export function linearTicks(min: number, max: number): number[] {
  const raw = (max - min) / 8 || 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step)
    ticks.push(Number(t.toPrecision(12)));
  return ticks;
}

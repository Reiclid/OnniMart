/**
 * Сітка «як у Pinterest» на телефоні: дві колонки, кожна картка йде в нижчу на цей момент.
 * Висоти оцінюються з даних, а не міряються, тому розклад той самий на сервері й у браузері
 * (без стрибка після гідратації), а довантажена сторінка не переставляє вже показані картки.
 */
export function masonryColumns(heights: number[], columns = 2): number[][] {
  const out = Array.from({ length: columns }, () => [] as number[]);
  const total = new Array<number>(columns).fill(0);
  heights.forEach((h, i) => {
    const col = total.indexOf(Math.min(...total)); // при рівних — ліва
    out[col].push(i);
    total[col] += h;
  });
  return out;
}

/** Картка на телефоні (≈ 140 px тексту, Body/M): ~20 символів у рядку назви */
const CHARS_PER_LINE = 20;

/** Скільки рядків займе назва (до 2 — line-clamp): перенос за словами, як у браузері */
export function nameLines(name: string): number {
  let lines = 1;
  let used = 0;
  for (const word of name.split(/\s+/).filter(Boolean)) {
    const need = used === 0 ? word.length : used + 1 + word.length;
    if (need <= CHARS_PER_LINE) used = need;
    else {
      lines += Math.ceil(word.length / CHARS_PER_LINE);
      used = word.length % CHARS_PER_LINE || CHARS_PER_LINE;
    }
  }
  return Math.min(2, lines);
}

/** Оцінка висоти картки, px: фото + тип продукту + назва (1–2 рядки) + ціна + мережа */
export function estimateCardHeight(card: { name: string; kind?: string | null; price: number | null; caption: string; note?: string }): number {
  return (
    20 + 140 + 10 + (card.kind ? 14 : 0) + nameLines(card.name) * 21 +
    (card.price !== null ? 8 + 22 : 0) +
    (card.caption || card.note ? 8 + 18 : 0)
  );
}

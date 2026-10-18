/**
 * Перевірка контрольної цифри GTIN (EAN-8, UPC-A, EAN-13, GTIN-14).
 * Ваги 3,1,3,1… рахуються справа наліво, не враховуючи саму контрольну цифру.
 */
export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d+$/.test(code) || code.length < 2) return false;
  const digits = [...code].map(Number);
  const check = digits.pop();
  const sum = digits
    .reverse()
    .reduce((acc, digit, i) => acc + digit * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Приводить штрихкод до GTIN-14 (ведучі нулі), щоб один і той самий товар
 * з різних джерел мав однаковий ключ: "4820001234567" і "04820001234567"
 * → "04820001234567". Повертає null для невалідних кодів.
 */
export function normalizeGtin(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  if (!hasValidCheckDigit(digits)) return null;
  return digits.padStart(14, '0');
}

/**
 * Коди "обмеженого обігу" (GS1 префікси 020–029, 040–049, 200–299, а для EAN-8 —
 * ті, що починаються з 0 або 2) мережі друкують самі: вагові товари, внутрішні
 * артикули. В іншій мережі той самий код означає інший товар, тому для
 * зіставлення між мережами вони непридатні.
 */
export function isRestrictedCirculation(gtin14: string): boolean {
  if (gtin14.startsWith('000000')) {
    const ean8 = gtin14.slice(6);
    return ean8[0] === '0' || ean8[0] === '2';
  }
  const prefix = Number(gtin14.slice(1, 4));
  return (
    (prefix >= 20 && prefix <= 29) ||
    (prefix >= 40 && prefix <= 49) ||
    (prefix >= 200 && prefix <= 299)
  );
}

/** Нормалізує список кодів зі сторінки: валідні, глобальні, без дублікатів. */
export function normalizeBarcodes(raw: readonly string[]): string[] {
  const result = new Set<string>();
  for (const code of raw) {
    const gtin = normalizeGtin(code);
    if (gtin && !isRestrictedCirculation(gtin)) result.add(gtin);
  }
  return [...result];
}

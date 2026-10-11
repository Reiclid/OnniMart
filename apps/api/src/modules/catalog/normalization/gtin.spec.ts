import {
  hasValidCheckDigit,
  isRestrictedCirculation,
  normalizeBarcodes,
  normalizeGtin,
} from './gtin';

describe('gtin', () => {
  it.each([
    '4006381333931', // EAN-13 (приклад GS1)
    '9002490200237', // Red Bull, EAN-13
    '90162664', // EAN-8
    '05449000132499', // GTIN-14 з ведучим нулем (zakaz.ua)
    '80000090162806', // GTIN-14
  ])('приймає валідний код %s', (code) => {
    expect(hasValidCheckDigit(code)).toBe(true);
  });

  it('відкидає код з неправильною контрольною цифрою', () => {
    expect(hasValidCheckDigit('4006381333932')).toBe(false);
    expect(normalizeGtin('11824797')).toBeNull(); // внутрішній артикул Сільпо
  });

  it('приводить коди до GTIN-14', () => {
    expect(normalizeGtin('5449000132499')).toBe('05449000132499');
    expect(normalizeGtin('05449000132499')).toBe('05449000132499');
    expect(normalizeGtin('90162664')).toBe('00000090162664');
    expect(normalizeGtin(' 5449000-132499 ')).toBe('05449000132499');
    expect(normalizeGtin('123')).toBeNull();
  });

  it('розпізнає коди обмеженого обігу', () => {
    expect(isRestrictedCirculation('00250013065514')).toBe(true); // 025…
    expect(isRestrictedCirculation('02123456789017')).toBe(true); // 212…
    expect(isRestrictedCirculation('00000020123457')).toBe(true); // EAN-8 2…
    expect(isRestrictedCirculation('05449000132499')).toBe(false);
    expect(isRestrictedCirculation('00000090162664')).toBe(false);
  });

  it('normalizeBarcodes залишає лише глобальні валідні коди без дублікатів', () => {
    // Реальний набір кодів Red Bull зі сторінки Сільпо
    const raw = [
      '90162664',
      '0250013065514',
      '9002490200237',
      '11824797',
      '09002490200237',
    ];
    expect(normalizeBarcodes(raw)).toEqual([
      '00000090162664',
      '09002490200237',
    ]);
  });
});

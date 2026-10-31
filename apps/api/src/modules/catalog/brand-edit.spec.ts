import { brandName, rekeyLineSlug, renameLine } from './brand-edit';

describe('rekeyLineSlug', () => {
  it('ключ дубліката на початку slug замінюється ключем основного бренду', () => {
    expect(
      rekeyLineSlug(
        'meine-kuchen-welt-backkuchen',
        'meine-kuchen-welt',
        'meine-kuchenwelt',
      ),
    ).toBe('meine-kuchenwelt-backkuchen');
    expect(rekeyLineSlug('premiia', 'premiia', 'premia')).toBe('premia');
  });

  it('лише цілий ключ на початку: "premia-x" не належить бренду "prem"', () => {
    expect(rekeyLineSlug('premia-sik', 'prem', 'other')).toBe('premia-sik');
  });
});

describe('renameLine', () => {
  it('замінює назву бренду на початку назви лінійки', () => {
    expect(renameLine('PREMIA · Сік', 'PREMIA', 'Премія')).toBe('Премія · Сік');
    expect(renameLine('PREMIA', 'PREMIA', 'Премія')).toBe('Премія');
    expect(renameLine('PREMIAX · Сік', 'PREMIA', 'Премія')).toBe(
      'PREMIAX · Сік',
    );
  });
});

describe('brandName', () => {
  it('обрізає пробіли; порожня, задовга або не рядок — 400', () => {
    expect(brandName('  San   Pellegrino ')).toBe('San Pellegrino');
    expect(() => brandName('  ')).toThrow('порожньою');
    expect(() => brandName('x'.repeat(101))).toThrow('100');
    expect(() => brandName(5)).toThrow('рядком');
  });
});

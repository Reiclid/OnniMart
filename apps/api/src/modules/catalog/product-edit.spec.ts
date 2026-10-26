import { BadRequestException } from '@nestjs/common';
import { gtinOf, productPatch, variantPatch } from './product-edit';

describe('productPatch', () => {
  it('змінює лише передані поля, "" і null очищують', () => {
    expect(
      productPatch({
        name: '  Напій  Coca-Cola ',
        variantLabel: '',
        imageUrl: null,
      }),
    ).toEqual({ name: 'Напій Coca-Cola', variantLabel: null, imageUrl: null });
  });

  it('бренд → slug як у зіставленні, порожній — без бренду', () => {
    expect(productPatch({ brand: 'Coca-Cola' }).brand).toEqual({
      slug: 'coca-cola',
      name: 'Coca-Cola',
    });
    expect(productPatch({ brand: ' ' })).toEqual({ brand: null });
  });

  it('категорія — лише з довідника, null повертає автоматичну', () => {
    expect(productPatch({ category: 'drinks' })).toEqual({
      category: 'drinks',
    });
    expect(productPatch({ category: null })).toEqual({ category: null });
    expect(() => productPatch({ category: 'napoi' })).toThrow(
      BadRequestException,
    );
  });

  it('відхиляє порожню назву, не-рядки та фото не http(s)', () => {
    expect(() => productPatch({ name: '' })).toThrow('не може бути порожнім');
    expect(() => productPatch({ name: 5 })).toThrow('має бути рядком');
    expect(() => productPatch({ imageUrl: 'javascript:alert(1)' })).toThrow(
      BadRequestException,
    );
    expect(() => productPatch({ name: 'x'.repeat(201) })).toThrow('задовге');
  });
});

describe('variantPatch', () => {
  it('розбирає фасування текстом', () => {
    expect(variantPatch({ quantity: '6 × 0,33 л' }).quantity).toMatchObject({
      measure: 'VOLUME',
      netQuantity: 1980,
      packCount: 6,
    });
  });

  it('нерозбірне фасування й порожній підпис — 400', () => {
    expect(() => variantPatch({ quantity: 'багато' })).toThrow(
      'Не вдалося розібрати',
    );
    expect(() => variantPatch({ label: ' ' })).toThrow('не може бути порожнім');
  });

  it('упаковку можна очистити', () => {
    expect(variantPatch({ packaging: '' })).toEqual({ packaging: null });
  });
});

describe('gtinOf', () => {
  it('нормалізує до 14 цифр і відхиляє неправильну контрольну цифру', () => {
    expect(gtinOf('5449000000996')).toBe('05449000000996');
    expect(() => gtinOf('5449000000997')).toThrow(BadRequestException);
    expect(() => gtinOf(undefined)).toThrow(BadRequestException);
  });
});

import { isBarcode } from './barcode';

describe('isBarcode', () => {
  it('8–14 цифр', () => {
    expect(isBarcode('4820017000277')).toBe(true);
    expect(isBarcode('96385074')).toBe(true);
    expect(isBarcode('07622202285592')).toBe(true);
    expect(isBarcode('1234567')).toBe(false);
    expect(isBarcode('https://example.com')).toBe(false);
    expect(isBarcode('482001700027a')).toBe(false);
  });
});

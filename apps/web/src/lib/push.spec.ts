import { base64UrlToBytes, deviceLabel } from './push';

describe('deviceLabel', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'Chrome · Android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 'Safari · iPhone'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', 'Edge · Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:132.0) Gecko/20100101 Firefox/132.0', 'Firefox · Mac'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', 'Samsung Internet · Android'],
  ])('%s', (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });

  it('нічого не впізнали — null', () => {
    expect(deviceLabel(null)).toBeNull();
    expect(deviceLabel('curl/8.0')).toBeNull();
  });
});

describe('base64UrlToBytes', () => {
  it('base64url без доповнення → ті самі байти', () => {
    expect([...base64UrlToBytes('-_8')]).toEqual([0xfb, 0xff]);
    expect(base64UrlToBytes('B'.repeat(87)).length).toBe(65); // публічний VAPID-ключ P-256
  });
});

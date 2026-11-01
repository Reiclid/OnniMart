import { isGone, isPushEndpoint } from './push';

describe('isPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/dXk9:APA91b',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
    'https://web.push.apple.com/QGuQyavXut',
  ])('push-сервіс браузера: %s', (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/x', // не HTTPS
    'https://fcm.googleapis.com:8443/fcm/send/x', // чужий порт
    'https://localhost:6379/', // внутрішня мережа
    'https://169.254.169.254/latest/meta-data',
    'https://fcm.googleapis.com.evil.example/x', // схожий хост
    'https://evilnotify.windows.com.example/x',
    'not a url',
  ])('інше — ні: %s', (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(false);
  });
});

describe('isGone', () => {
  it('404 і 410 — підписки нема; інші помилки — спробувати пізніше', () => {
    expect([404, 410, 429, 500, undefined].map(isGone)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

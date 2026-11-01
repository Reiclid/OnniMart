/**
 * Web Push: правила без I/O. Адресу (endpoint) дає браузер покупця, а воркер шле на неї POST —
 * тож приймаємо лише HTTPS-адреси відомих push-сервісів, інакше API стає проксі в будь-яку мережу.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Android), Samsung Internet, Opera
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /\.notify\.windows\.com$/, // Edge (Windows)
  /^web\.push\.apple\.com$/, // Safari (macOS, iOS 16.4+ з головного екрана)
];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      url.port === '' &&
      PUSH_HOSTS.some((host) => host.test(url.hostname))
    );
  } catch {
    return false;
  }
}

/** Що показує service worker (apps/web/public/sw.js): заголовок, текст, куди веде дотик */
export type PushMessage = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

/** Push-сервіс каже, що підписки вже нема (покупець відписався чи стер дані сайту) — пристрій видаляємо */
export const isGone = (statusCode: number | undefined) =>
  statusCode === 404 || statusCode === 410;

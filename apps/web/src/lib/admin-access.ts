/**
 * Хто може відкрити адмінку. Сайт можна виставити в інтернет (тунель для телефона), а
 * дії адмінки йдуть з ADMIN_TOKEN — тож без пароля адмінка працює лише з цього комп'ютера.
 *
 * - ADMIN_WEB_PASSWORD задано → Basic-авторизація з цим паролем (ім'я будь-яке);
 * - не задано → лише прямий запит на localhost. Next сам ставить x-forwarded-* з адресою
 *   клієнта, тому перевіряємо їх значення: усі адреси — loopback, хост — localhost.
 */
export type AdminAccess = 'ok' | 'challenge' | 'forbidden';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** Заголовки, які додають лише тунелі й проксі (Cloudflare, RFC 7239) */
const PROXY_HEADERS = ['cf-connecting-ip', 'cf-ray', 'forwarded', 'x-real-ip'];

export function adminAccess(headers: Headers, password: string | undefined): AdminAccess {
  if (password) {
    const [scheme, encoded] = (headers.get('authorization') ?? '').split(' ');
    if (scheme !== 'Basic' || !encoded) return 'challenge';
    let decoded: string;
    try {
      decoded = atob(encoded);
    } catch {
      return 'challenge'; // не base64
    }
    return decoded.slice(decoded.indexOf(':') + 1) === password ? 'ok' : 'challenge';
  }
  const local =
    LOCAL_HOST.test(headers.get('host') ?? '') &&
    LOCAL_HOST.test(headers.get('x-forwarded-host') ?? 'localhost') &&
    (headers.get('x-forwarded-for') ?? '::1').split(',').every((ip) => LOOPBACK.has(ip.trim())) &&
    !PROXY_HEADERS.some((h) => headers.has(h));
  return local ? 'ok' : 'forbidden';
}

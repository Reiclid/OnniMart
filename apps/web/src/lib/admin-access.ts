/**
 * Хто може відкрити адмінку. Сайт можна виставити в інтернет (тунель для телефона), а
 * дії адмінки йдуть з ADMIN_TOKEN — тож без пароля адмінка працює лише з цього комп'ютера.
 *
 * - ADMIN_WEB_PASSWORD задано → Basic-авторизація з цим паролем (ім'я будь-яке);
 * - не задано → лише прямий запит на localhost: усі адреси x-forwarded-for — loopback,
 *   хост — localhost. Next ставить ці заголовки лише якщо клієнт їх не надіслав (`??=`),
 *   тож вони нічого не доводять, поки сервер слухає мережу: `dev` і `start` слухають
 *   лише 127.0.0.1 (apps/web/package.json, scripts/share.ts). Сторонній сервер перед вебом
 *   мусить перезаписувати ці заголовки сам.
 *
 * ADMIN_EMAIL задано → понад це (adminGate) лише один акаунт: той, кого API позначає
 * `admin` (цей email, вхід тільки через Google). Тоді localhost не обовʼязковий — досить
 * входу в акаунт; ADMIN_WEB_PASSWORD, якщо задано, лишається другим замком.
 */
import { clientAddress } from './client-address';

export type AdminAccess = 'ok' | 'challenge' | 'forbidden';
/** 'login' — режим акаунта, але покупець не увійшов: на сторінку входу */
export type AdminGate = AdminAccess | 'login';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** Заголовки, які додають лише тунелі й проксі (Cloudflare, RFC 7239) */
const PROXY_HEADERS = ['cf-connecting-ip', 'cf-ray', 'forwarded', 'x-real-ip'];

/** Підбір пароля через тунель: після MAX_FAILURES невдач адресу не пускаємо LOCK_MS */
const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60_000;
const failures = new Map<string, { count: number; since: number }>();

export function adminAccess(headers: Headers, password: string | undefined): AdminAccess {
  if (password) {
    const client = clientAddress(headers) ?? 'unknown';
    const now = Date.now();
    const failed = failures.get(client);
    if (failed && now - failed.since > LOCK_MS) failures.delete(client);
    else if (failed && failed.count >= MAX_FAILURES) return 'forbidden';

    const [scheme, encoded] = (headers.get('authorization') ?? '').split(' ');
    if (scheme !== 'Basic' || !encoded) return 'challenge';
    let decoded: string;
    try {
      decoded = atob(encoded);
    } catch {
      decoded = ''; // не base64
    }
    if (sameText(decoded.slice(decoded.indexOf(':') + 1), password)) {
      failures.delete(client);
      return 'ok';
    }
    const entry = failures.get(client) ?? { count: 0, since: now };
    failures.set(client, { ...entry, count: entry.count + 1 });
    if (failures.size > 10_000) failures.clear(); // памʼять не росте від розсилки з багатьох адрес
    return 'challenge';
  }
  const local =
    LOCAL_HOST.test(headers.get('host') ?? '') &&
    LOCAL_HOST.test(headers.get('x-forwarded-host') ?? 'localhost') &&
    (headers.get('x-forwarded-for') ?? '::1').split(',').every((ip) => LOOPBACK.has(ip.trim())) &&
    !PROXY_HEADERS.some((h) => headers.has(h));
  return local ? 'ok' : 'forbidden';
}

/** Порівняння без раннього виходу: час відповіді не підказує, скільки символів збіглось */
function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Повна перевірка доступу до адмінки (proxy.ts і серверні дії). `isAdmin` питає API про
 * сесію поточного запиту: null — не увійшов, false — інший акаунт.
 */
export async function adminGate(
  headers: Headers,
  env: { password?: string; adminEmail?: string },
  isAdmin: () => Promise<boolean | null>,
): Promise<AdminGate> {
  const base = adminAccess(headers, env.password);
  if (!env.adminEmail) return base;
  if (env.password && base !== 'ok') return base;
  const admin = await isAdmin();
  if (admin === null) return 'login';
  return admin ? 'ok' : 'forbidden';
}

/** Чи сесія з цим токеном — адміністратор; null — сесії немає або вона закінчилась */
export async function sessionIsAdmin(token: string | undefined): Promise<boolean | null> {
  if (!token) return null;
  try {
    const response = await fetch(`${process.env.API_URL ?? 'http://localhost:3001'}/api/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401) return null;
    if (!response.ok) return false; // API лежить — не пускаємо
    const user = (await response.json()) as { admin?: unknown };
    return user.admin === true;
  } catch {
    return false;
  }
}

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  length: number,
) => Promise<Buffer>;

/** "scrypt:<сіль hex>:<хеш hex>" */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  const [algo, salt, hash] = (stored ?? '').split(':');
  if (algo !== 'scrypt' || !salt || !hash) {
    // Той самий час відповіді, навіть коли користувача немає: email не вгадати за таймінгом
    await scryptAsync(password, randomBytes(16), 64);
    return false;
  }
  const actual = await scryptAsync(password, Buffer.from(salt, 'hex'), 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

/** Токен сесії для cookie; у БД зберігається лише його SHA-256 */
export const newSessionToken = () => randomBytes(32).toString('base64url');

export const sessionTokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

import { hashPassword, sessionTokenHash, verifyPassword } from './password';

describe('password', () => {
  it('правильний пароль проходить, неправильний — ні', async () => {
    const stored = await hashPassword('correct horse');
    expect(stored).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('correct hors', stored)).toBe(false);
  });

  it('немає хешу (користувача немає) — false, без винятку', async () => {
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword('x', 'md5:abc')).toBe(false);
  });

  it('сіль різна, хеш токена стабільний', async () => {
    expect(await hashPassword('a')).not.toBe(await hashPassword('a'));
    expect(sessionTokenHash('t')).toBe(sessionTokenHash('t'));
  });
});

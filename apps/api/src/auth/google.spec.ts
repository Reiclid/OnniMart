import { exchangeGoogleCode, googleIdentity } from './google';

const token = (claims: object) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const now = new Date('2026-11-01T12:00:00Z');
const valid = {
  iss: 'https://accounts.google.com',
  aud: 'client-1',
  exp: now.getTime() / 1000 + 300,
  nonce: 'n1',
  sub: '1234567890',
  email: 'olena.k@gmail.com',
  email_verified: true,
  name: 'Olena K',
};
const expected = { clientId: 'client-1', nonce: 'n1', now };

describe('googleIdentity', () => {
  it('читає sub, email й ім’я з правильного токена', () => {
    expect(googleIdentity(token(valid), expected)).toEqual({
      sub: '1234567890',
      email: 'olena.k@gmail.com',
      name: 'Olena K',
    });
  });

  it.each([
    ['чужий клієнт', { aud: 'client-2' }],
    ['чужий видавець', { iss: 'https://evil.example' }],
    ['прострочений', { exp: now.getTime() / 1000 - 1 }],
    ['інший nonce (повтор чужого входу)', { nonce: 'n2' }],
    ['email не підтверджено', { email_verified: false }],
    ['без sub', { sub: '' }],
  ])('%s — помилка', (_case, patch) => {
    expect(() =>
      googleIdentity(token({ ...valid, ...patch }), expected),
    ).toThrow();
  });

  it('биті дані — помилка, а не виняток JSON', () => {
    expect(() => googleIdentity('not-a-jwt', expected)).toThrow('не читається');
  });
});

describe('exchangeGoogleCode', () => {
  const client = { clientId: 'client-1', clientSecret: 'secret' };
  const input = {
    code: 'c',
    codeVerifier: 'v',
    redirectUri: 'http://localhost:3000/auth/google/callback',
  };

  it('надсилає code, verifier і секрет; повертає id_token', async () => {
    const fetchFn = jest.fn(async () => Response.json({ id_token: 'jwt' }));
    expect(
      await exchangeGoogleCode(
        input,
        client,
        fetchFn as unknown as typeof fetch,
      ),
    ).toBe('jwt');
    const body = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as URLSearchParams;
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'c',
      code_verifier: 'v',
      client_secret: 'secret',
    });
  });

  it('Google відмовив — null', async () => {
    const fetchFn = async () =>
      Response.json({ error: 'invalid_grant' }, { status: 400 });
    expect(
      await exchangeGoogleCode(
        input,
        client,
        fetchFn as unknown as typeof fetch,
      ),
    ).toBeNull();
  });
});

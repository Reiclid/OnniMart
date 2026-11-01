/**
 * Вхід через Google (OpenID Connect, authorization code + PKCE). Веб веде покупця на Google
 * і повертає сюди code; API міняє його на ID-токен (секрет клієнта є лише тут) і читає з нього,
 * хто це. Підпис токена не перевіряємо: він прийшов прямо від token endpoint Google через TLS,
 * а цього OIDC Core §3.1.3.7 досить.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export type GoogleIdentity = {
  sub: string;
  email: string;
  name: string | null;
};

type Claims = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nonce?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
};

/** Перевіряє claims ID-токена; помилка — рядок з причиною (для логу), не для покупця */
export function googleIdentity(
  idToken: string,
  expected: { clientId: string; nonce: string; now?: Date },
): GoogleIdentity {
  let claims: Claims;
  try {
    claims = JSON.parse(
      Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Claims;
  } catch {
    throw new Error('ID-токен не читається');
  }
  const now = (expected.now ?? new Date()).getTime() / 1000;
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ISSUERS.includes(String(claims.iss))) throw new Error('чужий iss');
  if (!audience.includes(expected.clientId)) throw new Error('чужий aud');
  if (typeof claims.exp !== 'number' || claims.exp < now)
    throw new Error('токен прострочений');
  if (claims.nonce !== expected.nonce) throw new Error('nonce не збігається');
  if (typeof claims.sub !== 'string' || !claims.sub)
    throw new Error('немає sub');
  // Неперевірений email міг би прив'язатися до чужого акаунта з паролем
  if (typeof claims.email !== 'string' || claims.email_verified !== true)
    throw new Error('email не підтверджено');
  return {
    sub: claims.sub,
    email: claims.email,
    name: typeof claims.name === 'string' && claims.name ? claims.name : null,
  };
}

/** Обмін code на ID-токен; null — Google відмовив (прострочений чи вже використаний code) */
export async function exchangeGoogleCode(
  input: { code: string; codeVerifier: string; redirectUri: string },
  client: { clientId: string; clientSecret: string },
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const response = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { id_token?: unknown };
  return typeof body.id_token === 'string' ? body.id_token : null;
}

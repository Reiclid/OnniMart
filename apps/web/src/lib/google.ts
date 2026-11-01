import { createHash, randomBytes } from 'node:crypto';

/**
 * Вхід через Google (OIDC code + PKCE). /auth/google кладе state, verifier і nonce у коротку
 * httpOnly-cookie й веде на Google; /auth/google/callback звіряє state і віддає code в API,
 * який міняє його на ID-токен із секретом клієнта.
 */
export const GOOGLE_COOKIE = 'onnimart_google';
export const GOOGLE_COOKIE_PATH = '/auth/google';
export const GOOGLE_COOKIE_MAX_AGE = 10 * 60;

export type GoogleFlow = { state: string; verifier: string; nonce: string; next: string };

export const randomToken = () => randomBytes(32).toString('base64url');

/** PKCE S256 (RFC 7636): base64url(sha256(verifier)) */
export const pkceChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

export function googleAuthUrl(input: { clientId: string; redirectUri: string; flow: GoogleFlow }): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: input.flow.state,
    nonce: input.flow.nonce,
    code_challenge: pkceChallenge(input.flow.verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Адреса повернення: з оточення (тунель, GitHub Pages), інакше той самий сайт */
export const googleRedirectUri = (origin: string) => process.env.GOOGLE_REDIRECT_URI || `${origin}/auth/google/callback`;

export function parseGoogleFlow(value: string | undefined): GoogleFlow | null {
  try {
    const flow = JSON.parse(value ?? '') as Partial<GoogleFlow>;
    return [flow.state, flow.verifier, flow.nonce, flow.next].every((v) => typeof v === 'string' && v) ? (flow as GoogleFlow) : null;
  } catch {
    return null;
  }
}

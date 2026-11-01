import { googleAuthUrl, parseGoogleFlow, pkceChallenge } from './google';

describe('google', () => {
  it('PKCE S256 — приклад з RFC 7636 (додаток B)', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('адреса Google несе state, nonce і challenge, а не сам verifier', () => {
    const flow = { state: 's1', verifier: 'v'.repeat(43), nonce: 'n1', next: '/alerts' };
    const url = new URL(googleAuthUrl({ clientId: 'c1', redirectUri: 'http://localhost:3000/auth/google/callback', flow }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'c1',
      response_type: 'code',
      scope: 'openid email profile',
      state: 's1',
      nonce: 'n1',
      code_challenge: pkceChallenge(flow.verifier),
      code_challenge_method: 'S256',
    });
    expect(url.search).not.toContain(flow.verifier);
  });

  it('биту чи неповну cookie не приймає', () => {
    expect(parseGoogleFlow(undefined)).toBeNull();
    expect(parseGoogleFlow('{')).toBeNull();
    expect(parseGoogleFlow(JSON.stringify({ state: 's', verifier: 'v', nonce: '' , next: '/' }))).toBeNull();
    expect(parseGoogleFlow(JSON.stringify({ state: 's', verifier: 'v', nonce: 'n', next: '/' }))).toEqual({ state: 's', verifier: 'v', nonce: 'n', next: '/' });
  });
});

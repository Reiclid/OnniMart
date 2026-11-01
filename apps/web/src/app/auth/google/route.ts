import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { GOOGLE_COOKIE, GOOGLE_COOKIE_MAX_AGE, GOOGLE_COOKIE_PATH, googleAuthUrl, googleRedirectUri, randomToken } from '@/lib/google';
import { safeNext } from '@/lib/sign-in';

/** Кнопка «Continue with Google»: новий state/verifier/nonce у cookie → сторінка входу Google */
export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) redirect('/login?error=google');
  const flow = { state: randomToken(), verifier: randomToken(), nonce: randomToken(), next: safeNext(request.nextUrl.searchParams.get('next')) };
  (await cookies()).set(GOOGLE_COOKIE, JSON.stringify(flow), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: GOOGLE_COOKIE_PATH,
    maxAge: GOOGLE_COOKIE_MAX_AGE,
  });
  redirect(googleAuthUrl({ clientId, redirectUri: googleRedirectUri(request.nextUrl.origin), flow }));
}

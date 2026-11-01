import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { loginWithGoogle } from '@/api/generated/auth/auth';
import { GOOGLE_COOKIE, GOOGLE_COOKIE_PATH, googleRedirectUri, parseGoogleFlow } from '@/lib/google';
import { finishSignIn } from '@/lib/sign-in';

/** Повернення від Google: state з cookie має збігтися, далі code → API → сесія */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const jar = await cookies();
  const flow = parseGoogleFlow(jar.get(GOOGLE_COOKIE)?.value);
  // Одноразова: повтор тієї самої адреси вже не пройде
  jar.delete({ name: GOOGLE_COOKIE, path: GOOGLE_COOKIE_PATH });
  const code = params.get('code');
  // Покупець натиснув «Скасувати» в Google — просто назад до входу
  if (params.get('error') === 'access_denied') redirect(`/login?next=${encodeURIComponent(flow?.next ?? '/profile')}`);
  if (!flow || !code || params.get('state') !== flow.state) redirect('/login?error=google');

  const session = await loginWithGoogle({
    code,
    codeVerifier: flow.verifier,
    redirectUri: googleRedirectUri(request.nextUrl.origin),
    nonce: flow.nonce,
  }).then(
    (r) => r.data,
    () => null,
  );
  if (!session) redirect(`/login?error=google&next=${encodeURIComponent(flow.next)}`);
  await finishSignIn(session, session.created);
  redirect(flow.next);
}

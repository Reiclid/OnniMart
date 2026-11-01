import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/api/custom-fetch';
import { adminGate, sessionIsAdmin } from '@/lib/admin-access';

/** Заголовки адмінки: не індексувати, не кешувати, не вбудовувати в чужі сторінки */
const ADMIN_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

/** Адмінка — лише акаунт ADMIN_EMAIL (і/або цей комп'ютер чи пароль ADMIN_WEB_PASSWORD; lib/admin-access) */
export async function proxy(request: NextRequest) {
  const access = await adminGate(
    request.headers,
    { password: process.env.ADMIN_WEB_PASSWORD, adminEmail: process.env.ADMIN_EMAIL },
    () => sessionIsAdmin(request.cookies.get(SESSION_COOKIE)?.value),
  );
  if (access === 'ok') {
    const response = NextResponse.next();
    for (const [name, value] of Object.entries(ADMIN_HEADERS)) response.headers.set(name, value);
    return response;
  }
  if (access === 'login') {
    const next = request.nextUrl.pathname + request.nextUrl.search;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));
  }
  if (access === 'challenge') {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="OnniMart admin"', ...ADMIN_HEADERS },
    });
  }
  // Чужим — 404, ніби адмінки немає
  return new NextResponse('Not found', { status: 404, headers: ADMIN_HEADERS });
}

export const config = { matcher: '/admin/:path*' };

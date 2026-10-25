import { NextResponse, type NextRequest } from 'next/server';
import { adminAccess } from '@/lib/admin-access';

/** Адмінка — лише з цього комп'ютера або з паролем ADMIN_WEB_PASSWORD (lib/admin-access) */
export function proxy(request: NextRequest) {
  const access = adminAccess(request.headers, process.env.ADMIN_WEB_PASSWORD);
  if (access === 'ok') return NextResponse.next();
  if (access === 'challenge') {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="OnniMart admin"' },
    });
  }
  return new NextResponse('Not found', { status: 404 });
}

export const config = { matcher: '/admin/:path*' };

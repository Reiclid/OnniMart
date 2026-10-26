import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/api/custom-fetch';
import { trackGuestEvents } from '@/api/generated/events/events';
import { recordViews } from '@/api/generated/me/me';
import {
  CONSENT_COOKIE,
  GUEST_COOKIE_MAX_AGE,
  isUuid,
  parseConsent,
  parseViews,
  pushView,
  serializeViews,
  VIEWS_COOKIE,
  VISIT_COOKIE,
} from '@/lib/views';

/**
 * Відкритий товар у «Recently viewed». Обробник маршруту, а не серверна дія: дія, що ставить
 * cookie, перемальовує сторінку, а тут нема чого перемальовувати.
 */
export async function POST(_request: Request, ctx: RouteContext<'/products/[id]/view'>) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response(null, { status: 400 });
  const jar = await cookies();

  if (jar.has(SESSION_COOKIE)) {
    // Сесія могла закінчитись — тоді просто не записуємо
    await recordViews({ productIds: [id] }).catch(() => undefined);
    return new Response(null, { status: 204 });
  }

  const guest = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' } as const;
  jar.set(VIEWS_COOKIE, serializeViews(pushView(parseViews(jar.get(VIEWS_COOKIE)?.value), id)), { ...guest, maxAge: GUEST_COOKIE_MAX_AGE });

  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);
  if (consent && consent !== 'declined') {
    let sessionId = jar.get(VISIT_COOKIE)?.value;
    if (!isUuid(sessionId)) jar.set(VISIT_COOKIE, (sessionId = randomUUID()), guest);
    await trackGuestEvents({ anonId: consent.anonId, consent: true, sessionId, events: [{ type: 'view', productId: id }] }).catch(() => undefined);
  }
  return new Response(null, { status: 204 });
}

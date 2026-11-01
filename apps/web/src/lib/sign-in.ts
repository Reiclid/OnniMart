import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/api/custom-fetch';
import type { SessionDto } from '@/api/generated/model';
import { recordViews, updateMe } from '@/api/generated/me/me';
import {
  COUNTRY_COOKIE,
  CURRENCY_COOKIE,
  INTERESTS_COOKIE,
  isCountry,
  ONBOARDED_COOKIE,
  ONBOARDING_COOKIE_MAX_AGE,
  parseInterests,
} from './country';
import { currentCountry } from './session';
import { parseViews, VIEWS_COOKIE } from './views';

export const onboardingCookie = { sameSite: 'lax', path: '/', maxAge: ONBOARDING_COOKIE_MAX_AGE } as const;

/** Лише внутрішні адреси: відкритий редирект на чужий сайт неможливий */
export const safeNext = (value: unknown) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/profile';

/**
 * Після входу (пароль чи Google): cookie сесії, історія й вибір гостя переходять в акаунт.
 * Країна й категорії: новий акаунт бере вибір гостя; наявний — лише порожні поля, а пристрій далі йде за акаунтом
 */
export async function finishSignIn(session: SessionDto, isNew: boolean): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(session.expiresAt),
  });
  const auth = { headers: { Authorization: `Bearer ${session.token}` } };
  // Історія гостя переходить в акаунт (API чекає від найстарішого до найновішого)
  const views = parseViews(jar.get(VIEWS_COOKIE)?.value);
  if (views.length > 0) {
    await recordViews({ productIds: views.reverse() }, auth).catch(() => undefined);
    jar.delete(VIEWS_COOKIE);
  }
  const { user } = session;
  const guestInterests = parseInterests(jar.get(INTERESTS_COOKIE)?.value);
  const guestCurrency = jar.get(CURRENCY_COOKIE)?.value;
  const patch = {
    ...(isNew && { countryCode: await currentCountry() }),
    // Валюта: новий акаунт бере вибір гостя; наявний — свою (null — автоматично)
    ...(isNew && guestCurrency && /^[A-Z]{3}$/.test(guestCurrency) && { currencyCode: guestCurrency }),
    ...(guestInterests.length > 0 && user.interests.length === 0 && { interests: guestInterests }),
  };
  if (Object.keys(patch).length > 0) await updateMe(patch, auth).catch(() => undefined);
  const country = patch.countryCode ?? user.countryCode ?? undefined;
  if (isCountry(country)) jar.set(COUNTRY_COOKIE, country, onboardingCookie);
  if (!isNew) {
    if (user.currencyCode) jar.set(CURRENCY_COOKIE, user.currencyCode, onboardingCookie);
    else jar.delete(CURRENCY_COOKIE);
  }
  jar.set(ONBOARDED_COOKIE, '1', onboardingCookie);
}

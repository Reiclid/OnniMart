'use server';

// Дії покупця. Токен сесії живе лише в httpOnly-cookie на сервері Next.js
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ApiError, SESSION_COOKIE } from '@/api/custom-fetch';
import { login, logout, register } from '@/api/generated/auth/auth';
import { lookupBarcode } from '@/api/generated/catalog/catalog';
import { forgetGuest } from '@/api/generated/events/events';
import type { MessageKey } from '@/i18n';
import { getT } from '@/i18n/server';
import { PRODUCTS_PAGE_SIZE } from '@/lib/offers';
import {
  COUNTRY_COOKIE,
  CURRENCY_COOKIE,
  INTERESTS_COOKIE,
  isCountry,
  ONBOARDED_COOKIE,
  ONBOARDING_COOKIE_MAX_AGE,
  parseInterests,
} from '@/lib/country';
import { currentCountry, findProducts, guestConsent, localized } from '@/lib/session';
import { CONSENT_COOKIE, GUEST_COOKIE_MAX_AGE, parseViews, VIEWS_COOKIE } from '@/lib/views';
import {
  clearViews,
  createSubscription,
  deleteMe,
  deleteSubscription,
  markNotificationsRead,
  recordViews,
  updateMe,
  updateSubscription,
} from '@/api/generated/me/me';

export type FormState = { error: string | null };

/** Лише внутрішні адреси: відкритий редирект на чужий сайт неможливий */
const safeNext = (value: FormDataEntryValue | null) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/profile';

const AUTH_ERRORS: Record<number, MessageKey> = {
  400: 'auth.errors.badInput',
  401: 'auth.errors.wrongCredentials',
  409: 'auth.errors.emailTaken',
  429: 'auth.errors.tooMany',
};

export async function authenticate(_prev: FormState, form: FormData): Promise<FormState> {
  const credentials = { email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') };
  let session;
  try {
    const name = String(form.get('name') ?? '').trim();
    session = (form.get('mode') === 'register' ? await register({ ...credentials, ...(name && { name }) }) : await login(credentials)).data;
  } catch (error) {
    if (error instanceof ApiError) return { error: (await getT())(AUTH_ERRORS[error.status] ?? 'auth.errors.generic') };
    throw error;
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(session.expiresAt),
  });
  // Історія гостя переходить в акаунт (API чекає від найстарішого до найновішого)
  const views = parseViews(jar.get(VIEWS_COOKIE)?.value);
  if (views.length > 0) {
    await recordViews({ productIds: views.reverse() }, { headers: { Authorization: `Bearer ${session.token}` } }).catch(() => undefined);
    jar.delete(VIEWS_COOKIE);
  }
  // Країна й категорії: новий акаунт бере вибір гостя; наявний — лише порожні поля, а пристрій далі йде за акаунтом
  const { user } = session;
  const guestInterests = parseInterests(jar.get(INTERESTS_COOKIE)?.value);
  const isNew = form.get('mode') === 'register';
  const guestCurrency = jar.get(CURRENCY_COOKIE)?.value;
  const patch = {
    ...(isNew && { countryCode: await currentCountry() }),
    // Валюта: новий акаунт бере вибір гостя; наявний — свою (null — автоматично)
    ...(isNew && guestCurrency && /^[A-Z]{3}$/.test(guestCurrency) && { currencyCode: guestCurrency }),
    ...(guestInterests.length > 0 && user.interests.length === 0 && { interests: guestInterests }),
  };
  if (Object.keys(patch).length > 0) {
    await updateMe(patch, { headers: { Authorization: `Bearer ${session.token}` } }).catch(() => undefined);
  }
  const country = patch.countryCode ?? user.countryCode ?? undefined;
  if (isCountry(country)) jar.set(COUNTRY_COOKIE, country, onboardingCookie);
  if (!isNew) {
    if (user.currencyCode) jar.set(CURRENCY_COOKIE, user.currencyCode, onboardingCookie);
    else jar.delete(CURRENCY_COOKIE);
  }
  jar.set(ONBOARDED_COOKIE, '1', onboardingCookie);
  redirect(safeNext(form.get('next')));
}

const onboardingCookie = { sameSite: 'lax', path: '/', maxAge: ONBOARDING_COOKIE_MAX_AGE } as const;

/** Перший запуск (Figma 14–16): країна й категорії — у cookie, а в акаунт, якщо покупець увійшов. Skip — лише позначка */
export async function finishOnboarding(form: FormData) {
  const jar = await cookies();
  if (!form.get('skip')) {
    const country = String(form.get('country') ?? '');
    const interests = parseInterests(form.getAll('interest').map(String).join('.'));
    if (isCountry(country)) jar.set(COUNTRY_COOKIE, country, onboardingCookie);
    jar.set(INTERESTS_COOKIE, interests.join('.'), onboardingCookie);
    if (jar.has(SESSION_COOKIE)) {
      await updateMe({ ...(isCountry(country) && { countryCode: country }), interests }).catch(() => undefined);
    }
  }
  jar.set(ONBOARDED_COOKIE, '1', onboardingCookie);
  redirect('/');
}

export async function signOut() {
  await logout().catch(() => undefined); // сесія могла вже закінчитись
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/');
}

export async function deleteAccount() {
  await deleteMe();
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/');
}

// Налаштування (Figma 08, 17–19): кожна зміна зберігається одразу, без кнопки «Save»
export async function saveNotifications(form: FormData) {
  await updateMe({ notifyPush: form.get('notifyPush') === 'on', notifyEmail: form.get('notifyEmail') === 'on' });
  revalidatePath('/settings');
}

export async function saveDiscount(form: FormData) {
  await updateMe({ minDiscount: Number(form.get('minDiscount')) || 0 });
  revalidatePath('/settings');
}

export async function saveChains(form: FormData) {
  await updateMe({ chainIds: form.getAll('chainIds').map(String) });
  revalidatePath('/settings');
}

/** Currency (Figma 21): cookie пристрою й, якщо покупець увійшов, акаунт; «auto» — валюта країни */
export async function setCurrency(form: FormData) {
  const raw = String(form.get('currency') ?? '');
  const currency = /^[A-Z]{3}$/.test(raw) ? raw : null;
  const jar = await cookies();
  if (currency) jar.set(CURRENCY_COOKIE, currency, onboardingCookie);
  else jar.delete(CURRENCY_COOKIE);
  if (jar.has(SESSION_COOKIE)) await updateMe({ currencyCode: currency });
  revalidatePath('/', 'layout');
}

/** Country & currency (Figma 17): cookie пристрою й, якщо покупець увійшов, акаунт */
export async function setCountry(form: FormData) {
  const country = String(form.get('country') ?? '');
  if (!isCountry(country)) return;
  const jar = await cookies();
  jar.set(COUNTRY_COOKIE, country, onboardingCookie);
  if (jar.has(SESSION_COOKIE)) await updateMe({ countryCode: country });
  revalidatePath('/', 'layout');
}

/** Згода на події для рекомендацій: покупець — в акаунті, гість — у cookie (банер, Privacy & data) */
export async function setConsent(form: FormData) {
  const on = form.get('consent') === 'on';
  const jar = await cookies();
  if (jar.has(SESSION_COOKIE)) {
    await updateMe({ telemetryConsent: on }); // false — API стирає вже зібране
  } else {
    const consent = await guestConsent();
    if (!on && consent && consent !== 'declined') await forgetGuest(consent.anonId);
    jar.set(CONSENT_COOKIE, on ? crypto.randomUUID() : 'no', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GUEST_COOKIE_MAX_AGE,
    });
  }
  revalidatePath('/', 'layout');
}

export async function clearHistory() {
  const jar = await cookies();
  if (jar.has(SESSION_COOKIE)) await clearViews();
  else jar.delete(VIEWS_COOKIE);
  revalidatePath('/', 'layout');
}

/** «Track price»: будь-яка знижка або ціна нижче цілі, для обраного фасування */
export async function trackPrice(form: FormData) {
  const productId = String(form.get('productId'));
  const target = Number(form.get('targetPrice'));
  const below = form.get('mode') === 'below' && target > 0;
  const currency = String(form.get('currency') ?? '');
  try {
    await createSubscription({
      variantId: String(form.get('variantId')),
      targetPrice: below ? Math.round(target * 100) / 100 : null,
      // Поріг — у валюті показу: ціни інших валют воркер перераховує за курсом
      currency: below && /^[A-Z]{3}$/.test(currency) ? currency : null,
      notifyOnPromo: true,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect(`/login?next=/products/${productId}`);
    throw error;
  }
  redirect('/alerts');
}

export async function setSubscriptionActive(form: FormData) {
  await updateSubscription(String(form.get('id')), { isActive: form.get('active') === 'true' });
  revalidatePath('/alerts');
}

export async function removeSubscription(form: FormData) {
  await deleteSubscription(String(form.get('id')));
  revalidatePath('/alerts');
}

export async function readAllNotifications() {
  await markNotificationsRead();
  revalidatePath('/alerts');
}

/** Сканер: товар за штрихкодом, а якщо його немає в цінах — дані Open Food Facts і схожі */
export async function findBarcode(code: string) {
  const [{ data }, country] = await Promise.all([lookupBarcode(code), currentCountry()]);
  // Ціни країни покупця першими, як у каталозі
  return {
    ...data,
    product: data.product && localized([data.product], country)[0],
    suggestions: localized(data.suggestions, country),
  };
}

/** Наступна сторінка каталогу для нескінченної прокрутки */
export async function moreProducts(query: { q?: string; chain?: string; category?: string; page: number }) {
  return (await findProducts({ ...query, pageSize: PRODUCTS_PAGE_SIZE })).items;
}

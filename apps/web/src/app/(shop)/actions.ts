'use server';

// Дії покупця. Токен сесії живе лише в httpOnly-cookie на сервері Next.js
import { cookies, headers } from 'next/headers';
import type { CatalogFilters } from '@/lib/catalog-filters';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ApiError, SESSION_COOKIE } from '@/api/custom-fetch';
import { login, logout, register } from '@/api/generated/auth/auth';
import { getCategories, lookupBarcode } from '@/api/generated/catalog/catalog';
import { forgetGuest } from '@/api/generated/events/events';
import type { MessageKey } from '@/i18n';
import { getT } from '@/i18n/server';
import { PRODUCTS_PAGE_SIZE } from '@/lib/offers';
import { deviceLabel } from '@/lib/push';
import {
  COUNTRY_COOKIE,
  CURRENCY_COOKIE,
  INTERESTS_COOKIE,
  isCountry,
  ONBOARDED_COOKIE,
  parseInterests,
} from '@/lib/country';
import { formatShown } from '@/lib/format';
import { currentCountry, currentMoney, findProducts, guestConsent, localized } from '@/lib/session';
import { querySuggestions, topCategory } from '@/lib/suggestions';
import { afterSignIn, finishSignIn, onboardingCookie, safeNext } from '@/lib/sign-in';
import { CONSENT_COOKIE, GUEST_COOKIE_MAX_AGE, VIEWS_COOKIE } from '@/lib/views';
import {
  addFavourite,
  clearViews,
  deleteDevice,
  createSubscription,
  deleteMe,
  deleteSubscription,
  markNotificationsRead,
  removeFavourite,
  saveDevice,
  testPush,
  updateMe,
  updateSubscription,
} from '@/api/generated/me/me';

export type FormState = { error: string | null };

const AUTH_ERRORS: Record<number, MessageKey> = {
  400: 'auth.errors.badInput',
  401: 'auth.errors.wrongCredentials',
  409: 'auth.errors.emailTaken',
  429: 'auth.errors.tooMany',
};

export async function authenticate(_prev: FormState, form: FormData): Promise<FormState> {
  const isNew = form.get('mode') === 'register';
  const credentials = { email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') };
  if (isNew && form.get('password2') !== credentials.password) return { error: (await getT())('auth.errors.passwordsDiffer') };
  let session;
  try {
    session = (isNew ? await register(credentials) : await login(credentials)).data;
  } catch (error) {
    if (error instanceof ApiError) return { error: (await getT())(AUTH_ERRORS[error.status] ?? 'auth.errors.generic') };
    throw error;
  }
  await finishSignIn(session, isNew);
  redirect(afterSignIn(safeNext(form.get('next')), isNew));
}

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

/** PRD-01: серце на сторінці товару — «я це купую», без сповіщень */
export async function toggleFavourite(form: FormData) {
  const productId = String(form.get('productId'));
  try {
    await (form.get('on') === 'true' ? addFavourite(productId) : removeFavourite(productId));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect(`/login?next=/products/${productId}`);
    throw error;
  }
  revalidatePath(`/products/${productId}`);
  revalidatePath('/profile', 'layout');
}

export async function setSubscriptionActive(form: FormData) {
  // Перемикач: увімкнений надсилає поле active, вимкнений — нічого
  await updateSubscription(String(form.get('id')), { isActive: form.has('active') });
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
export type SearchSuggestions = {
  queries: string[];
  category: { slug: string; name: string } | null;
  products: { id: string; name: string; imageUrl: string | null; price: string | null; chains: number }[];
};

/** Підказки під полем пошуку (від 2-ї літери): доповнення запиту, категорія, до 3 товарів */
export async function searchSuggestions(query: string): Promise<SearchSuggestions> {
  const q = String(query).trim().slice(0, 100);
  if (q.length < 2) return { queries: [], category: null, products: [] };
  const [page, { data: categories }, money] = await Promise.all([
    findProducts({ q, page: 1, pageSize: 20 }),
    getCategories(),
    currentMoney(),
  ]);
  const slug = topCategory(page.items);
  const category = categories.find((c) => c.slug === slug);
  return {
    queries: querySuggestions(q, page.items.map((p) => p.name)),
    category: category ? { slug: category.slug, name: category.name } : null,
    products: page.items.slice(0, 3).map((p) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      price: p.prices[0] ? formatShown(p.prices[0].min, p.prices[0].currency, money).text : null,
      chains: p.chainsCount,
    })),
  };
}

export async function moreProducts(query: CatalogFilters & { page: number }) {
  return (await findProducts({ ...query, pageSize: PRODUCTS_PAGE_SIZE })).items;
}

/** Push у цьому браузері (Figma 25–26): PushSubscription → API; назва пристрою — з User-Agent */
export async function savePushDevice(subscription: { endpoint: string; p256dh: string; auth: string }) {
  const label = deviceLabel((await headers()).get('user-agent'));
  await saveDevice({ endpoint: String(subscription.endpoint), p256dh: String(subscription.p256dh), auth: String(subscription.auth), ...(label && { label }) });
  revalidatePath('/settings/notifications');
}

export async function removePushDevice(id: string) {
  await deleteDevice(String(id));
  revalidatePath('/settings/notifications');
}

/** Тестове сповіщення мовою покупця; повертає, чи push-сервіс його прийняв */
export async function sendTestPush(endpoint: string): Promise<boolean> {
  const t = await getT();
  const { data } = await testPush({ title: t('notificationSettings.testTitle'), body: t('notificationSettings.testBody'), endpoint: String(endpoint) });
  return data.sent > 0;
}

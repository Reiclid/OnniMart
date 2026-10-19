'use server';

// Дії покупця. Токен сесії живе лише в httpOnly-cookie на сервері Next.js
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ApiError, SESSION_COOKIE } from '@/api/custom-fetch';
import { login, logout, register } from '@/api/generated/auth/auth';
import { getProducts } from '@/api/generated/catalog/catalog';
import { PRODUCTS_PAGE_SIZE } from '@/lib/offers';
import {
  createSubscription,
  deleteMe,
  deleteSubscription,
  markNotificationsRead,
  updateMe,
  updateSubscription,
} from '@/api/generated/me/me';

export type FormState = { error: string | null };

/** Лише внутрішні адреси: відкритий редирект на чужий сайт неможливий */
const safeNext = (value: FormDataEntryValue | null) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/profile';

const AUTH_ERRORS: Record<number, string> = {
  400: 'Check the email and use a password of at least 8 characters.',
  401: 'Wrong email or password.',
  409: 'This email is already registered. Sign in instead.',
  429: 'Too many attempts. Try again in a minute.',
};

export async function authenticate(_prev: FormState, form: FormData): Promise<FormState> {
  const credentials = { email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') };
  let session;
  try {
    const name = String(form.get('name') ?? '').trim();
    session = (form.get('mode') === 'register' ? await register({ ...credentials, ...(name && { name }) }) : await login(credentials)).data;
  } catch (error) {
    if (error instanceof ApiError) return { error: AUTH_ERRORS[error.status] ?? 'Something went wrong. Try again.' };
    throw error;
  }
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(session.expiresAt),
  });
  redirect(safeNext(form.get('next')));
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

export async function saveSettings(form: FormData) {
  await updateMe({
    notifyPush: form.get('notifyPush') === 'on',
    notifyEmail: form.get('notifyEmail') === 'on',
    minDiscount: Number(form.get('minDiscount')) || 0,
    chainIds: form.getAll('chainIds').map(String),
  });
  revalidatePath('/settings');
}

/** «Track price»: будь-яка знижка або ціна нижче цілі, для обраного фасування */
export async function trackPrice(form: FormData) {
  const productId = String(form.get('productId'));
  const target = Number(form.get('targetPrice'));
  try {
    await createSubscription({
      variantId: String(form.get('variantId')),
      targetPrice: form.get('mode') === 'below' && target > 0 ? Math.round(target * 100) / 100 : null,
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

/** Наступна сторінка каталогу для нескінченної прокрутки */
export async function moreProducts({ q, chain, page }: { q?: string; chain?: string; page: number }) {
  return (await getProducts({ q, chain, page, pageSize: PRODUCTS_PAGE_SIZE })).data.items;
}

import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { createT, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, translateRich, type Locale, type MessageKey, type T } from '.';

/** Мова запиту: cookie onnimart_locale, інакше англійська */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** t() для серверних компонентів і дій */
export async function getT(): Promise<T> {
  return createT(await getLocale());
}

/** Усе разом для сторінок: мова (для Intl), t() і rich() для тексту з елементами */
export async function getI18n() {
  const locale = await getLocale();
  const t = createT(locale);
  const rich = (key: MessageKey, params: Record<string, ReactNode>) => translateRich(locale, key, params);
  return { locale, t, rich };
}

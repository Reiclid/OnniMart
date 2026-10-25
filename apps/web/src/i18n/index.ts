import type { ReactNode } from 'react';
import { de } from './messages/de';
import { en } from './messages/en';
import { uk } from './messages/uk';

/**
 * Локалізація вітрини без бібліотек. Каталог `en` задає ключі; uk і de мусять мати ті самі
 * (інакше — помилка типів), а i18n.spec.ts перевіряє ще й плейсхолдери та форми множини.
 * Рядок: '… {name} …'; множина: { one, few, many, other } — форма з Intl.PluralRules за {count}.
 * Назви товарів не перекладаємо: вони приходять від мереж.
 */

export type Plural = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
type Leaf = string | Plural;

/** Ті самі ключі, що в en, але будь-які рядки й форми множини */
export type Catalog<T = typeof en> = { [K in keyof T]: T[K] extends Leaf ? (T[K] extends string ? string : Plural) : Catalog<T[K]> };

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Leaf ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Paths<typeof en>;
export type Params = Record<string, string | number>;
export type T = (key: MessageKey, params?: Params) => string;

export const LOCALES = ['en', 'uk', 'de'] as const;
export type Locale = (typeof LOCALES)[number];
/** Поки англійська для всіх (рішення власника); інші — лише з cookie, доки переклади не перевірено */
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'onnimart_locale';

export const CATALOGS: Record<Locale, Catalog> = { en, uk, de };
/** Для Intl: дати й числа у звичному для мови вигляді */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', uk: 'uk-UA', de: 'de-DE' };

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);

export const isPlural = (value: unknown): value is Plural =>
  typeof value === 'object' && value !== null && typeof (value as Plural).other === 'string';

function lookup(catalog: Catalog, key: string): Leaf {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], catalog);
  if (typeof value !== 'string' && !isPlural(value)) throw new Error(`Немає перекладу: ${key}`);
  return value;
}

function template(locale: Locale, key: string, count: unknown): string {
  const value = lookup(CATALOGS[locale], key);
  if (typeof value === 'string') return value;
  const form = new Intl.PluralRules(INTL_LOCALE[locale]).select(Number(count ?? 0));
  return value[form] ?? value.other;
}

export function translate(locale: Locale, key: MessageKey, params: Params = {}): string {
  return template(locale, key, params.count).replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Як translate, але плейсхолдери можна замінити елементами (жирний код, посилання) */
export function translateRich(locale: Locale, key: MessageKey, params: Record<string, ReactNode>): ReactNode[] {
  return template(locale, key, params.count)
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      return name && name in params ? params[name] : part;
    });
}

export const createT = (locale: Locale): T => (key, params) => translate(locale, key, params);

/** Історія переглядів гостя й згода на події — у cookie цього пристрою (PRD-04; Figma 10–12) */

/** id товарів, найновіший першим; після входу список переходить в акаунт */
export const VIEWS_COOKIE = 'onnimart_views';
/** Згода гостя: його анонімний id (uuid) — погодився, `no` — відмовився; немає — ще не питали */
export const CONSENT_COOKIE = 'onnimart_consent';
/** Сесія вебу для подій одного візиту (cookie без терміну — живе до закриття браузера) */
export const VISIT_COOKIE = 'onnimart_visit';

/** Скільки товарів памʼятаємо (як MAX_VIEWS в API) */
export const MAX_VIEWS = 50;
/** Півроку, як і події (AUDIT §9.3) */
export const GUEST_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string | undefined): value is string => !!value && UUID.test(value);

/** Значення cookie → id; чуже чи зіпсоване відкидається */
export const parseViews = (raw: string | undefined): string[] =>
  [...new Set((raw ?? '').split('.').filter(isUuid))].slice(0, MAX_VIEWS);

/** Відкритий товар стає першим, повтор не дублюється */
export const pushView = (views: string[], productId: string): string[] =>
  [productId, ...views.filter((id) => id !== productId)].slice(0, MAX_VIEWS);

/** `.` не потребує кодування в cookie: 50 id ≈ 1,8 КБ */
export const serializeViews = (views: string[]) => views.join('.');

export type GuestConsent = { anonId: string } | 'declined' | null;

export const parseConsent = (raw: string | undefined): GuestConsent =>
  raw === 'no' ? 'declined' : isUuid(raw) ? { anonId: raw } : null;

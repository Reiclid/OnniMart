/** Рішення про сповіщення за підпискою — без БД, щоб перевірити тестами */
import { QUALITY_LIMITS } from '../quality/checks';
import { isStale } from '../quality/freshness';
import { convert } from '../rates/rates';

export interface AlertOffer {
  listingId: string;
  chainId: string;
  chainName: string;
  /** Країна мережі */
  country: string;
  currency: string;
  price: number;
  regularPrice: number | null;
  isOnPromo: boolean;
  /** Коли картка отримала поточну ціну: та сама ціна в нову акцію — нове сповіщення */
  priceSince?: Date;
  /** Ціна попереднього знімка картки */
  previousPrice?: number;
  /** Коли картку востаннє бачили на сайті */
  lastSeenAt?: Date;
}

/** Як порівнювати ціни підписки: її валюта, країна покупця й курси за 1 EUR */
export interface PriceContext {
  /** Валюта targetPrice; null — стара підписка: гривня, якщо є, інакше перша валюта */
  currency: string | null;
  /** Без вибраних мереж — лише мережі цієї країни (купити можна лише там) */
  country: string | null;
  perEur: Record<string, number> | null;
}

export interface AlertSubscription {
  id: string;
  targetPrice: number | null;
  notifyOnPromo: boolean;
  /** Порожній — усі мережі */
  chainIds: string[];
}

export interface Alert {
  type: 'TARGET_PRICE_REACHED' | 'PROMO_STARTED';
  offer: AlertOffer;
  /** Повторно не повідомляємо, доки та сама картка тримає ту саму ціну без перерви */
  dedupeKey: string;
}

/**
 * Пропозиції, які порівнюємо з ціллю, від найдешевшої; `value` — ціна у валюті підписки.
 * Мережі: вибрані, інакше мережі країни покупця (якщо там товар є), інакше всі.
 * Ціни інших валют перераховуються за курсом; без курсу пропозиція випадає.
 */
export function relevantOffers(
  offers: AlertOffer[],
  chainIds: string[],
  ctx: PriceContext = { currency: null, country: null, perEur: null },
): (AlertOffer & { value: number })[] {
  const inCountry = offers.filter((o) => o.country === ctx.country);
  const inChains = chainIds.length
    ? offers.filter((o) => chainIds.includes(o.chainId))
    : inCountry.length
      ? inCountry
      : offers;
  const currency =
    ctx.currency ??
    (inChains.some((o) => o.currency === 'UAH')
      ? 'UAH'
      : inChains[0]?.currency);
  return inChains
    .flatMap((o) => {
      const value =
        ctx.currency === null
          ? o.currency === currency
            ? o.price
            : null
          : convert(o.price, o.currency, ctx.currency, ctx.perEur);
      return value === null ? [] : [{ ...o, value }];
    })
    .sort((a, b) => a.value - b.value);
}

/** Параметри тексту сповіщення з payload; null — старий запис, лише готовий текст */
export interface NotificationParams {
  product: string;
  price: number;
  currency: string;
  chain: string;
  target: number | null;
  targetCurrency: string | null;
  discount: number | null;
}

export function notificationParams(
  payload: unknown,
): NotificationParams | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v : null);
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  const [product, price, currency, chain] = [
    text(p.product),
    num(p.price),
    text(p.currency),
    text(p.chain),
  ];
  if (product === null || price === null || !currency || !chain) return null;
  return {
    product,
    price,
    currency,
    chain,
    target: num(p.target),
    targetCurrency: text(p.targetCurrency),
    discount: num(p.discount),
  };
}

export const discountOf = (o: AlertOffer) =>
  o.regularPrice && o.regularPrice > o.price
    ? Math.round((1 - o.price / o.regularPrice) * 100)
    : 0;

/**
 * Ціна схожа на помилку даних (PRD-32): знижка понад 70 % або падіння більш ніж
 * утричі від попереднього знімка. Такі ціни видно на /admin/quality, а сповіщення
 * про них не надсилаємо: «99 € → 0,79 €» у NORMA — зламана закреслена ціна, не акція.
 */
export function isSuspicious(o: AlertOffer): boolean {
  if (discountOf(o) > QUALITY_LIMITS.maxDiscount * 100) return true;
  return (
    o.previousPrice !== undefined &&
    o.price > 0 &&
    o.previousPrice / o.price > QUALITY_LIMITS.jump
  );
}

export function decideAlert(
  subscription: AlertSubscription,
  offers: AlertOffer[],
  minDiscount: number,
  ctx?: PriceContext,
  now: Date = new Date(),
): Alert | null {
  const relevant = relevantOffers(
    // Давно не бачена ціна могла вже змінитись: не сповіщаємо про неї
    offers.filter((o) => !isSuspicious(o) && !isStale(o.lastSeenAt, now)),
    subscription.chainIds,
    ctx,
  );
  const cheapest = relevant[0];
  if (!cheapest) return null;
  const key = (o: AlertOffer) =>
    `${subscription.id}:${o.listingId}:${o.price.toFixed(2)}` +
    (o.priceSince ? `:${o.priceSince.getTime()}` : '');

  if (
    subscription.targetPrice !== null &&
    cheapest.value <= subscription.targetPrice
  ) {
    return {
      type: 'TARGET_PRICE_REACHED',
      offer: cheapest,
      dedupeKey: key(cheapest),
    };
  }
  if (subscription.notifyOnPromo) {
    const promo = relevant.find(
      (o) => o.isOnPromo && discountOf(o) > 0 && discountOf(o) >= minDiscount,
    );
    if (promo)
      return { type: 'PROMO_STARTED', offer: promo, dedupeKey: key(promo) };
  }
  return null;
}

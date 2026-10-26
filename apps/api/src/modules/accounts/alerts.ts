/** Рішення про сповіщення за підпискою — без БД, щоб перевірити тестами */
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
  /** Повторно не повідомляємо, доки та сама картка має ту саму ціну */
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

export const discountOf = (o: AlertOffer) =>
  o.regularPrice && o.regularPrice > o.price
    ? Math.round((1 - o.price / o.regularPrice) * 100)
    : 0;

export function decideAlert(
  subscription: AlertSubscription,
  offers: AlertOffer[],
  minDiscount: number,
  ctx?: PriceContext,
): Alert | null {
  const relevant = relevantOffers(offers, subscription.chainIds, ctx);
  const cheapest = relevant[0];
  if (!cheapest) return null;
  const key = (o: AlertOffer) =>
    `${subscription.id}:${o.listingId}:${o.price.toFixed(2)}`;

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

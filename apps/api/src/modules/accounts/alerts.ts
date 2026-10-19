/** Рішення про сповіщення за підпискою — без БД, щоб перевірити тестами */

export interface AlertOffer {
  listingId: string;
  chainId: string;
  chainName: string;
  currency: string;
  price: number;
  regularPrice: number | null;
  isOnPromo: boolean;
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

/** Цільова ціна задана в основній валюті: беремо гривню, якщо вона є, інакше першу */
export function relevantOffers(
  offers: AlertOffer[],
  chainIds: string[],
): AlertOffer[] {
  const inChains = chainIds.length
    ? offers.filter((o) => chainIds.includes(o.chainId))
    : offers;
  const currency = inChains.some((o) => o.currency === 'UAH')
    ? 'UAH'
    : inChains[0]?.currency;
  return inChains
    .filter((o) => o.currency === currency)
    .sort((a, b) => a.price - b.price);
}

export const discountOf = (o: AlertOffer) =>
  o.regularPrice && o.regularPrice > o.price
    ? Math.round((1 - o.price / o.regularPrice) * 100)
    : 0;

export function decideAlert(
  subscription: AlertSubscription,
  offers: AlertOffer[],
  minDiscount: number,
): Alert | null {
  const relevant = relevantOffers(offers, subscription.chainIds);
  const cheapest = relevant[0];
  if (!cheapest) return null;
  const key = (o: AlertOffer) =>
    `${subscription.id}:${o.listingId}:${o.price.toFixed(2)}`;

  if (
    subscription.targetPrice !== null &&
    cheapest.price <= subscription.targetPrice
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

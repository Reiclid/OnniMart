import { AlertOffer, decideAlert, relevantOffers } from './alerts';

const offer = (
  chainId: string,
  price: number,
  extra: Partial<AlertOffer> = {},
): AlertOffer => ({
  listingId: `l-${chainId}`,
  chainId,
  chainName: chainId.toUpperCase(),
  currency: 'UAH',
  price,
  regularPrice: null,
  isOnPromo: false,
  ...extra,
});

const sub = (extra = {}) => ({
  id: 's1',
  targetPrice: null as number | null,
  notifyOnPromo: true,
  chainIds: [] as string[],
  ...extra,
});

describe('decideAlert', () => {
  it('ціна досягла цілі — найдешевша пропозиція', () => {
    const alert = decideAlert(
      sub({ targetPrice: 50 }),
      [offer('silpo', 52), offer('eko', 49.9)],
      0,
    );
    expect(alert).toMatchObject({
      type: 'TARGET_PRICE_REACHED',
      offer: { chainId: 'eko' },
      dedupeKey: 's1:l-eko:49.90',
    });
  });

  it('ціль не досягнута й акцій немає — нічого', () => {
    expect(
      decideAlert(sub({ targetPrice: 40 }), [offer('eko', 49.9)], 0),
    ).toBeNull();
  });

  it('акція від мінімальної знижки користувача', () => {
    const promo = offer('silpo', 46.49, {
      isOnPromo: true,
      regularPrice: 61.99,
    });
    expect(decideAlert(sub(), [offer('eko', 61.9), promo], 20)).toMatchObject({
      type: 'PROMO_STARTED',
      offer: { chainId: 'silpo' },
    });
    expect(decideAlert(sub(), [promo], 30)).toBeNull(); // −25 % < 30 %
    expect(decideAlert(sub({ notifyOnPromo: false }), [promo], 0)).toBeNull();
  });

  it('лише вибрані мережі й основна валюта', () => {
    const offers = [
      offer('eko', 40),
      offer('silpo', 60),
      offer('aldi', 1.5, { currency: 'EUR' }),
    ];
    expect(
      relevantOffers(offers, ['silpo', 'aldi']).map((o) => o.chainId),
    ).toEqual(['silpo']);
    expect(relevantOffers([offers[2]], []).map((o) => o.chainId)).toEqual([
      'aldi',
    ]);
    expect(
      decideAlert(sub({ targetPrice: 50, chainIds: ['silpo'] }), offers, 0),
    ).toBeNull();
  });
});

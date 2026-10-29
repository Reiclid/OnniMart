import { AlertOffer, decideAlert, relevantOffers } from './alerts';

const offer = (
  chainId: string,
  price: number,
  extra: Partial<AlertOffer> = {},
): AlertOffer => ({
  listingId: `l-${chainId}`,
  chainId,
  chainName: chainId.toUpperCase(),
  country: 'UA',
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

  it('та сама ціна в нову акцію — новий ключ, тобто нове сповіщення', () => {
    const promo = (since: string) =>
      decideAlert(
        sub(),
        [
          offer('eko', 39.9, {
            isOnPromo: true,
            regularPrice: 49.9,
            priceSince: new Date(since),
          }),
        ],
        0,
      )!.dedupeKey;
    expect(promo('2026-10-19T08:00:00Z')).toBe(
      's1:l-eko:39.90:' + Date.parse('2026-10-19T08:00:00Z'),
    );
    expect(promo('2026-10-26T08:00:00Z')).not.toBe(
      promo('2026-10-19T08:00:00Z'),
    );
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

  it('ціль у валюті підписки: ціни інших валют перераховано за курсом', () => {
    const ctx = {
      currency: 'USD',
      country: 'UA',
      perEur: { EUR: 1, UAH: 50, USD: 1.1 },
    };
    // 66 ₴ = 1.32 €= 1.452 $ → 1.45 $
    const offers = [offer('silpo', 66), offer('eko', 70)];
    expect(relevantOffers(offers, [], ctx)[0]).toMatchObject({
      chainId: 'silpo',
      value: 1.45,
    });
    expect(
      decideAlert(sub({ targetPrice: 1.5 }), offers, 0, ctx),
    ).toMatchObject({
      type: 'TARGET_PRICE_REACHED',
      offer: { chainId: 'silpo', price: 66 },
    });
    expect(decideAlert(sub({ targetPrice: 1.4 }), offers, 0, ctx)).toBeNull();
    // Без курсу порівнювати нема з чим
    expect(relevantOffers(offers, [], { ...ctx, perEur: null })).toEqual([]);
  });

  it('без вибраних мереж — лише мережі країни покупця', () => {
    const ctx = { currency: 'EUR', country: 'DE', perEur: { EUR: 1, UAH: 50 } };
    const offers = [
      offer('silpo', 40),
      offer('aldi', 1.5, { currency: 'EUR', country: 'DE' }),
    ];
    expect(relevantOffers(offers, [], ctx).map((o) => o.chainId)).toEqual([
      'aldi',
    ]);
    // Вибрані мережі важливіші за країну
    expect(
      relevantOffers(offers, ['silpo'], ctx).map((o) => o.chainId),
    ).toEqual(['silpo']);
    // У країні покупця товару немає — усі мережі
    expect(relevantOffers([offers[0]], [], ctx).map((o) => o.value)).toEqual([
      0.8,
    ]);
  });
});

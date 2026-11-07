import {
  AlertOffer,
  decideAlert,
  notificationParams,
  relevantOffers,
} from './alerts';

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

  it('ціна схожа на помилку даних — сповіщення немає, береться наступна пропозиція', () => {
    // NORMA: закреслена 99,00 замість 0,99 — «знижка 99 %»
    const broken = offer('norma', 0.79, { isOnPromo: true, regularPrice: 99 });
    expect(decideAlert(sub(), [broken], 0)).toBeNull();
    // Падіння вчетверо від попереднього знімка
    const drop = offer('aldi', 0.99, { previousPrice: 3.99 });
    expect(
      decideAlert(sub({ targetPrice: 2 }), [drop, offer('lidl', 1.89)], 0),
    ).toMatchObject({ offer: { chainId: 'lidl' } });
    // Звичайна акція −50 % і падіння вдвічі — сповіщення є
    const promo = offer('eko', 1, {
      isOnPromo: true,
      regularPrice: 2,
      previousPrice: 2,
    });
    expect(decideAlert(sub({ targetPrice: 1 }), [promo], 0)).toMatchObject({
      type: 'TARGET_PRICE_REACHED',
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

describe('decideAlert: стара ціна', () => {
  it('не сповіщає про картку, яку давно не бачили', () => {
    const now = new Date('2026-11-07T00:00:00Z');
    const stale = {
      ...offer('silpo', 50),
      lastSeenAt: new Date('2026-10-01T00:00:00Z'),
    };
    const subscription = {
      id: 'sub',
      targetPrice: 60,
      notifyOnPromo: false,
      chainIds: [],
    };
    expect(decideAlert(subscription, [stale], 0, undefined, now)).toBeNull();
    expect(
      decideAlert(
        subscription,
        [{ ...stale, lastSeenAt: now }],
        0,
        undefined,
        now,
      ),
    ).not.toBeNull();
  });
});

describe('notificationParams', () => {
  it('нове сповіщення — дані для тексту мовою покупця', () => {
    expect(
      notificationParams({
        productId: 'p1',
        product: 'Cola · 0,5 л',
        price: 29.9,
        currency: 'UAH',
        chain: 'NOVUS',
        target: 30,
        targetCurrency: 'UAH',
        discount: 0,
      }),
    ).toEqual({
      product: 'Cola · 0,5 л',
      price: 29.9,
      currency: 'UAH',
      chain: 'NOVUS',
      target: 30,
      targetCurrency: 'UAH',
      discount: 0,
    });
  });

  it('старе сповіщення без назви товару — null (веб покаже готовий текст)', () => {
    expect(
      notificationParams({ productId: 'p1', price: 29.9, currency: 'UAH' }),
    ).toBeNull();
    expect(notificationParams(null)).toBeNull();
  });
});

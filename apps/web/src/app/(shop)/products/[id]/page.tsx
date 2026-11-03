import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/api/custom-fetch';
import { getPriceHistory, getProduct, getSimilarProducts } from '@/api/generated/catalog/catalog';
import { getFavouriteIds } from '@/api/generated/me/me';
import { productCard } from '@/components/ProductCard';
import { ProductMasonry } from '@/components/ProductMasonry';
import { BackButton } from '@/components/BackButton';
import { ChainPriceRow } from '@/components/ChainPriceRow';
import { PriceChart } from '@/components/PriceChart';
import { RecordView } from '@/components/RecordView';
import { RollingNumber } from '@/components/RollingNumber';
import { SlidingPill } from '@/components/SlidingPill';
import { buttonStyles, Chip, HeartIcon, ProductImage } from '@/components/ui';
import { currencySymbol, formatMoney, formatShown, formatUnitPrice, lineChipLabel, splitProductName } from '@/lib/format';
import { productView } from '@/lib/offers';
import { getI18n } from '@/i18n/server';
import { INTL_LOCALE } from '@/i18n';
import { COUNTRIES, shownPrice } from '@/lib/country';
import { currentCountry, currentMoney, currentUser } from '@/lib/session';
import { toggleFavourite, trackPrice } from '../../actions';

export const dynamic = 'force-dynamic';

const WINDOWS = [
  ['30', 'priceHistory.window.30'],
  ['90', 'priceHistory.window.90'],
  ['365', 'priceHistory.window.365'],
] as const;

export default async function ProductPage(props: PageProps<'/products/[id]'>) {
  const [{ id }, params] = await Promise.all([props.params, props.searchParams]);
  const [{ data: product }, { data: similar }] = await Promise.all([
    getProduct(id).catch((error: Error) => {
      if (error instanceof ApiError && error.status === 404) notFound();
      throw error;
    }),
    // Аналоги — не головне: збій не ламає сторінку товару
    getSimilarProducts(id).catch(() => ({ data: [] })),
  ]);
  const v = typeof params.v === 'string' ? params.v : undefined;
  const country = await currentCountry();
  const home = COUNTRIES[country].currency;
  const { offers, cheapest, sizes, updatedAt, variant } = productView(product, v, home);
  const flavours = product.line?.products ?? [];
  // Валюта показу: головні цінники перераховано, під ними справжня ціна мережі (у БД — рідна валюта)
  const [user, { t, locale }, money] = await Promise.all([currentUser(), getI18n(), currentMoney(country)]);
  const hero = cheapest?.currentPrice != null ? formatShown(cheapest.currentPrice, cheapest.currency, money) : null;
  // Поріг «Below a price» — у валюті показу, як і головний цінник
  const target = cheapest?.currentPrice != null ? shownPrice(cheapest.currentPrice, cheapest.currency, money) : null;
  // Історія цін (PRD-02) — у рідній валюті найдешевшої мережі: минулі ціни за сьогоднішнім курсом вводили б в оману
  const days = params.days === '90' || params.days === '365' ? params.days : '30';
  const history =
    variant && cheapest
      ? await getPriceHistory(product.id, { variantId: variant.id, days: Number(days) as 30 | 90 | 365 }).then((r) => r.data, () => null)
      : null;
  const stats = history?.stats.find((s) => s.currency === cheapest?.currency);
  const series = history?.series.filter((s) => s.currency === cheapest?.currency) ?? [];
  // Серце не головне: збій API лишає його порожнім
  const favourite = user ? await getFavouriteIds().then((r) => r.data.productIds.includes(product.id), () => false) : false;
  const { kind, title } = splitProductName(product.name, product.brand);
  const heart = `press grid size-11 shrink-0 place-items-center rounded-full border border-line bg-surface ${favourite ? 'text-danger' : 'text-fg-muted hover:text-fg'}`;

  return (
    <div data-white className="space-y-8">
      <RecordView productId={product.id} />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="relative md:sticky md:top-6 md:self-start">
          <ProductImage src={product.imageUrl} preload className="aspect-square w-full" />
          {/* На десктопі шлях назад — хлібні крихти (Figma: 06 Товар — десктоп) */}
          <BackButton fallback="/products" label={t('nav.back')} className="absolute top-3 left-3 md:hidden" />
        </div>

        <div className="space-y-6">
          {product.category && (
            <nav aria-label={t('product.breadcrumb')} className="text-body-sm text-fg-muted">
              <Link href="/products" className="hover:text-fg">{t('nav.catalog')}</Link>
              {' › '}
              <Link href={`/products?category=${product.category.slug}`} className="hover:text-fg">{product.category.name}</Link>
            </nav>
          )}
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-1">
              {/* Бренд уже в заголовку — окремо над ним не показуємо */}
              {!kind && product.brand && <div className="text-body-sm font-semibold text-brand">{product.brand}</div>}
              <h1 className="text-display font-bold">{title}</h1>
            </div>
            {user ? (
              <form action={toggleFavourite}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="on" value={String(!favourite)} />
                <button type="submit" aria-pressed={favourite} aria-label={t(favourite ? 'favourites.remove' : 'favourites.add')} className={heart}>
                  <HeartIcon fill={favourite ? 'currentColor' : 'none'} />
                </button>
              </form>
            ) : (
              <Link href={`/login?next=/products/${product.id}`} aria-label={t('favourites.add')} className={heart}>
                <HeartIcon />
              </Link>
            )}
          </div>

          {cheapest && hero && (
            <div className="rounded-lg bg-brand p-5 text-white">
              <div className="text-body-sm opacity-80">{t('product.lowestPrice', { chain: cheapest.chainName })}</div>
              <RollingNumber value={hero.text} className="text-display font-bold" />
              {/* Ціна за одиницю — у тій самій валюті; порожній рядок не зникає, щоб блок не стрибав */}
              <div className="text-body-sm opacity-90">
                <RollingNumber value={formatUnitPrice(cheapest, money) || ' '} />
              </div>
              {hero.original && <div className="mt-3 border-t border-white/20 pt-3 text-body-sm opacity-90 tabular-nums">{t('chainRow.inStore', { price: hero.original })}</div>}
            </div>
          )}

          {sizes.length > 1 && (
            <section className="space-y-2">
              <h2 className="text-body-sm font-semibold text-fg-muted">{t('product.packSize')}</h2>
              <SlidingPill className="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-1 rounded-md bg-page p-1">
                {sizes.map((size) => (
                  <Link
                    key={size.id}
                    href={`?v=${size.id}`}
                    replace
                    scroll={false}
                    aria-current={size.id === variant?.id ? 'true' : undefined}
                    // Товщину й колір бере aria-current: SlidingPill ставить його одразу на дотик,
                    // і змінна Inter плавно перетікає 400 → 600 разом із пігулкою
                    className={`relative rounded-sm px-2 py-2 text-center text-fg-muted transition-[color,font-weight] duration-(--duration-spring-smooth) ease-spring-smooth aria-[current=true]:font-semibold aria-[current=true]:text-fg ${
                      // До гідратації білий фон — у самого сегмента, потім його бере «пігулка»
                      size.id === variant?.id ? 'bg-surface shadow-floating [[data-ready]_&]:bg-transparent [[data-ready]_&]:shadow-none' : ''
                    }`}
                  >
                    <div className="text-body">{size.label}</div>
                    {size.unit && (
                      <div className={`text-caption tabular-nums ${size.best ? 'font-semibold text-brand' : ''}`}>
                        {formatUnitPrice(size.unit)}
                        {size.best && ` · ${t('product.best')}`}
                      </div>
                    )}
                  </Link>
                ))}
              </SlidingPill>
            </section>
          )}

          {flavours.length > 1 && (
            <section className="space-y-2">
              <h2 className="text-body-sm font-semibold text-fg-muted">{t('product.flavour')}</h2>
              <div className="flex flex-wrap gap-2">
                {flavours.map((p) => (
                  <Chip key={p.id} href={`/products/${p.id}`} selected={p.id === product.id} replace>
                    {lineChipLabel(p, flavours)}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          {variant && cheapest?.currentPrice != null && (
            <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
              <h2 className="text-title-sm font-semibold">{t('product.trackPrice')}</h2>
              {user ? (
                <form action={trackPrice} className="space-y-3">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="variantId" value={variant.id} />
                  <input type="hidden" name="currency" value={target?.currency} />
                  <label className="flex items-center gap-3 text-body">
                    <input type="radio" name="mode" value="any" defaultChecked className="size-5 accent-brand" />
                    {t('product.anyDiscount')}
                  </label>
                  <label className="flex items-center gap-3 text-body">
                    <input type="radio" name="mode" value="below" className="size-5 accent-brand" />
                    <span className="flex-1">{t('product.belowPrice')}</span>
                    <input
                      name="targetPrice"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      defaultValue={((target?.value ?? cheapest.currentPrice) * 0.9).toFixed(2)}
                      aria-label={t('product.targetPrice')}
                      className="w-28 rounded-sm border border-line px-3 py-2 text-right text-body"
                    />
                    <span className="text-body text-fg-muted">{currencySymbol(target?.currency ?? cheapest.currency)}</span>
                  </label>
                  <button type="submit" className={`${buttonStyles.primary} w-full`}>{t('product.startTracking', { variant: variant.label })}</button>
                </form>
              ) : (
                <Link href={`/login?next=/products/${product.id}`} className={`${buttonStyles.secondary} w-full`}>
                  {t('product.signInToTrack')}
                </Link>
              )}
            </section>
          )}

          {stats && series.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-title-sm font-semibold">{t('priceHistory.title')}</h2>
                <div className="flex gap-1">
                  {WINDOWS.map(([d, key]) => (
                    <Chip key={d} href={`?${new URLSearchParams({ ...(variant && { v: variant.id }), days: d })}`} selected={d === days} replace>
                      {t(key)}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-body-sm tabular-nums">
                {/* «Найнижча за N днів» — лише коли дешевше справді бувало і давно (не шум першого тижня) */}
                {stats.lowerSeen && stats.lowestForDays >= 7 && (
                  <span className="rounded-sm bg-selected px-2 py-1 font-semibold text-brand">{t('priceHistory.lowestFor', { count: stats.lowestForDays })}</span>
                )}
                <span className="rounded-sm bg-page px-2 py-1">{t('priceHistory.low30', { price: formatMoney(stats.low30, stats.currency) })}</span>
                {stats.spread > 0 && (
                  <span className="rounded-sm bg-page px-2 py-1">{t('priceHistory.spread', { percent: `${Math.round(stats.spread * 100)}%` })}</span>
                )}
              </div>
              <PriceChart series={series} highlight={cheapest?.id} locale={INTL_LOCALE[locale]} label={t('priceHistory.chart')} />
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-title-sm font-semibold">{t('product.pricesInChains')}</h2>
            {offers.map((offer) => (
              <ChainPriceRow key={offer.id} offer={offer} cheapest={offers.length > 1 && offer.id === cheapest?.id} money={money} />
            ))}
            {updatedAt && (
              <p className="text-caption text-fg-muted">
                {t('product.pricesUpdated', {
                  date: new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updatedAt)),
                })}
              </p>
            )}
          </section>

        </div>
      </div>

      {similar.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-title-sm font-semibold">{t('product.similar')}</h2>
          <ProductMasonry bare items={similar.map((p) => ({ card: productCard(p, t, money) }))} />
        </section>
      )}
    </div>
  );
}

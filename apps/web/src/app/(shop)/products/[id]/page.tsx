import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/api/custom-fetch';
import { getProduct, getSimilarProducts } from '@/api/generated/catalog/catalog';
import { ProductCard, productCard } from '@/components/ProductCard';
import { ChainPriceRow } from '@/components/ChainPriceRow';
import { buttonStyles, Chip, ProductImage } from '@/components/ui';
import { formatMoney, formatUnitPrice, lineChipLabel } from '@/lib/format';
import { productView } from '@/lib/offers';
import { getI18n } from '@/i18n/server';
import { INTL_LOCALE } from '@/i18n';
import { currentUser } from '@/lib/session';
import { trackPrice } from '../../actions';

export const dynamic = 'force-dynamic';

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
  const { offers, cheapest, sizes, updatedAt, variant } = productView(product, v);
  const flavours = product.line?.products ?? [];
  const [user, { t, locale }] = await Promise.all([currentUser(), getI18n()]);

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <ProductImage src={product.imageUrl} className="aspect-square w-full border border-line md:sticky md:top-6" />

        <div className="space-y-6">
          {product.category && (
            <nav aria-label={t('product.breadcrumb')} className="text-body-sm text-fg-muted">
              <Link href="/products" className="hover:text-fg">{t('nav.catalog')}</Link>
              {' › '}
              <Link href={`/products?category=${product.category.slug}`} className="hover:text-fg">{product.category.name}</Link>
            </nav>
          )}
          <div className="space-y-1">
            {product.brand && <div className="text-body-sm font-semibold text-brand">{product.brand}</div>}
            <h1 className="text-display font-bold">{product.name}</h1>
          </div>

          {cheapest?.currentPrice != null && (
            <div className="rounded-lg bg-brand p-5 text-white">
              <div className="text-body-sm opacity-80">{t('product.lowestPrice', { chain: cheapest.chainName })}</div>
              <div className="text-display font-bold">{formatMoney(cheapest.currentPrice, cheapest.currency)}</div>
              <div className="text-body-sm opacity-90">{formatUnitPrice(cheapest)}</div>
            </div>
          )}

          {sizes.length > 1 && (
            <section className="space-y-2">
              <h2 className="text-body-sm font-semibold text-fg-muted">{t('product.packSize')}</h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-1 rounded-md bg-page p-1">
                {sizes.map((size) => (
                  <Link
                    key={size.id}
                    href={`?v=${size.id}`}
                    scroll={false}
                    aria-current={size.id === variant?.id ? 'true' : undefined}
                    className={`rounded-sm px-2 py-2 text-center ${size.id === variant?.id ? 'bg-surface font-semibold shadow-floating' : 'text-fg-muted'}`}
                  >
                    <div className="text-body">{size.label}</div>
                    {size.unit && (
                      <div className={`text-caption ${size.best ? 'font-semibold text-brand' : ''}`}>
                        {formatUnitPrice(size.unit)}
                        {size.best && ` · ${t('product.best')}`}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {flavours.length > 1 && (
            <section className="space-y-2">
              <h2 className="text-body-sm font-semibold text-fg-muted">{t('product.flavour')}</h2>
              <div className="flex flex-wrap gap-2">
                {flavours.map((p) => (
                  <Chip key={p.id} href={`/products/${p.id}`} selected={p.id === product.id}>
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
                      defaultValue={(cheapest.currentPrice * 0.9).toFixed(2)}
                      aria-label={t('product.targetPrice')}
                      className="w-28 rounded-sm border border-line px-3 py-2 text-right text-body"
                    />
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

          <section className="space-y-2">
            <h2 className="text-title-sm font-semibold">{t('product.pricesInChains')}</h2>
            {offers.map((offer) => (
              <ChainPriceRow key={offer.id} offer={offer} cheapest={offers.length > 1 && offer.id === cheapest?.id} />
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {similar.map((p) => (
              <ProductCard key={p.id} card={productCard(p, t)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

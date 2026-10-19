import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/api/custom-fetch';
import { getProduct } from '@/api/generated/catalog/catalog';
import { ChainPriceRow } from '@/components/ChainPriceRow';
import { buttonStyles, Chip, ProductImage } from '@/components/ui';
import { formatMoney, formatUnitPrice, lineChipLabel } from '@/lib/format';
import { productView } from '@/lib/offers';
import { currentUser } from '@/lib/session';
import { trackPrice } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ProductPage(props: PageProps<'/products/[id]'>) {
  const [{ id }, params] = await Promise.all([props.params, props.searchParams]);
  const { data: product } = await getProduct(id).catch((error: Error) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const v = typeof params.v === 'string' ? params.v : undefined;
  const { local, abroad, cheapest, sizes, updatedAt, variant } = productView(product, v);
  const flavours = product.line?.products ?? [];
  const user = await currentUser();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ProductImage src={product.imageUrl} className="aspect-square w-full border border-line md:sticky md:top-6" />

      <div className="space-y-6">
        <div className="space-y-1">
          {product.brand && <div className="text-body-sm font-semibold text-brand">{product.brand}</div>}
          <h1 className="text-display font-bold">{product.name}</h1>
        </div>

        {cheapest?.currentPrice != null && (
          <div className="rounded-lg bg-brand p-5 text-white">
            <div className="text-body-sm opacity-80">Lowest price · {cheapest.chainName}</div>
            <div className="text-display font-bold">{formatMoney(cheapest.currentPrice, cheapest.currency)}</div>
            <div className="text-body-sm opacity-90">{formatUnitPrice(cheapest)}</div>
          </div>
        )}

        {sizes.length > 1 && (
          <section className="space-y-2">
            <h2 className="text-body-sm font-semibold text-fg-muted">Pack size</h2>
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
                      {size.best && ' · best'}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {flavours.length > 1 && (
          <section className="space-y-2">
            <h2 className="text-body-sm font-semibold text-fg-muted">Flavour</h2>
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
            <h2 className="text-title-sm font-semibold">Track price</h2>
            {user ? (
              <form action={trackPrice} className="space-y-3">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="variantId" value={variant.id} />
                <label className="flex items-center gap-3 text-body">
                  <input type="radio" name="mode" value="any" defaultChecked className="size-5 accent-brand" />
                  Any discount in any chain
                </label>
                <label className="flex items-center gap-3 text-body">
                  <input type="radio" name="mode" value="below" className="size-5 accent-brand" />
                  <span className="flex-1">Below a price</span>
                  <input
                    name="targetPrice"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    defaultValue={(cheapest.currentPrice * 0.9).toFixed(2)}
                    aria-label="Target price"
                    className="w-28 rounded-sm border border-line px-3 py-2 text-right text-body"
                  />
                </label>
                <button type="submit" className={`${buttonStyles.primary} w-full`}>Start tracking {variant.label}</button>
              </form>
            ) : (
              <Link href={`/login?next=/products/${product.id}`} className={`${buttonStyles.secondary} w-full`}>
                Sign in to track this price
              </Link>
            )}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-title-sm font-semibold">Prices in chains</h2>
          {local.map((offer) => (
            <ChainPriceRow key={offer.id} offer={offer} cheapest={local.length > 1 && offer.id === cheapest?.id} />
          ))}
          {updatedAt && (
            <p className="text-caption text-fg-muted">
              Prices updated {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updatedAt))}
            </p>
          )}
        </section>

        {abroad.length > 0 && (
          <details className="space-y-2">
            <summary className="cursor-pointer text-body-sm font-semibold text-brand">Other countries ({abroad.length})</summary>
            {abroad.map((offer) => (
              <ChainPriceRow key={offer.id} offer={offer} />
            ))}
          </details>
        )}
      </div>
    </div>
  );
}

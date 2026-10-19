import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/api/custom-fetch';
import { getProduct } from '@/api/generated/catalog/catalog';
import { ChainPriceRow } from '@/components/ChainPriceRow';
import { Chip, ProductImage } from '@/components/ui';
import { formatMoney, formatUnitPrice, lineChipLabel } from '@/lib/format';
import { productView } from '@/lib/offers';

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

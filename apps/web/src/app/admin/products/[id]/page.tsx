import Link from 'next/link';
import { ApiError } from '@/api/custom-fetch';
import { notFound } from 'next/navigation';
import { getProduct } from '@/api/generated/catalog/catalog';
import type { ListingSummaryDto } from '@/api/generated/model';
import { MatchingAction } from '@/components/MatchingAction';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, formatPrice, formatScore, lineChipLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProductPage(props: PageProps<'/admin/products/[id]'>) {
  const { id } = await props.params;
  const response = await getProduct(id).catch((error: Error) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const product = response.data;
  const lineProducts = product.line?.products ?? [];
  const siblings = lineProducts.filter((p) => p.id !== product.id);
  const chipLabel = (p: { name: string; variantLabel: string | null }) => lineChipLabel(p, lineProducts);

  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="text-sm text-blue-700 hover:underline">
        ← Каталог
      </Link>

      <section className="flex flex-wrap gap-6 rounded-lg border border-slate-200 bg-white p-5">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- зображення з сайту мережі
          <img src={product.imageUrl} alt="" className="h-36 w-36 rounded object-contain" />
        ) : (
          <div className="h-36 w-36 rounded bg-slate-100" />
        )}
        <div className="min-w-64 flex-1 space-y-2">
          {product.brand && <div className="text-sm font-medium text-slate-500">{product.brand}</div>}
          <h1 className="text-2xl font-bold">{product.name}</h1>
          {product.variantLabel && (
            <span className="inline-block rounded bg-amber-50 px-2 py-0.5 text-sm text-amber-800">
              {product.variantLabel}
            </span>
          )}
          {product.line && siblings.length > 0 && (
            <div className="space-y-1 pt-2">
              <div className="text-xs uppercase text-slate-500">Лінійка «{product.line.name}»</div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs text-white">
                  {chipLabel(product)}
                </span>
                {siblings.map((sibling) => (
                  <Link
                    key={sibling.id}
                    href={`/admin/products/${sibling.id}`}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    {chipLabel(sibling)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {product.variants.map((variant) => (
        <section key={variant.id} className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-lg font-semibold">{variant.label}</h2>
            <span className="text-sm text-slate-500">
              {variant.offers.length} {variant.offers.length === 1 ? 'мережа' : 'мереж'}
            </span>
            {variant.barcodes.length > 0 && (
              <span className="font-mono text-xs text-slate-500">{variant.barcodes.join(', ')}</span>
            )}
          </div>
          <OffersTable offers={variant.offers} />
        </section>
      ))}
    </div>
  );
}

function OffersTable({ offers }: { offers: ListingSummaryDto[] }) {
  // Пропозиції згруповано за валютою (₴, потім €) і відсортовано від найдешевшої.
  // Найдешевша позначається окремо в кожній валюті, якщо в ній кілька мереж.
  const cheapest = new Set<string>();
  for (const currency of new Set(offers.map((o) => o.currency))) {
    const group = offers.filter((o) => o.currency === currency);
    if (group.length > 1) cheapest.add(group[0].id);
  }
  const isCheapest = (id: string) => cheapest.has(id);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Мережа</th>
            <th className="px-3 py-2">Назва в мережі</th>
            <th className="px-3 py-2 text-right">Ціна</th>
            <th className="px-3 py-2 text-right">За одиницю</th>
            <th className="px-3 py-2">Зіставлено</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {offers.map((offer) => (
            <tr key={offer.id} className={isCheapest(offer.id) ? 'bg-green-50' : ''}>
              <td className="px-3 py-2 whitespace-nowrap">
                <div className="font-medium">{offer.chainName}</div>
                {isCheapest(offer.id) ? (
                  <span className="rounded bg-green-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                    найдешевше
                  </span>
                ) : (
                  <div className="text-xs text-slate-400">{formatDateTime(offer.lastSeenAt)}</div>
                )}
              </td>
              <td className="min-w-48 px-3 py-2">
                <Link href={`/admin/listings/${offer.id}`} className="text-blue-700 hover:underline">
                  {offer.name}
                </Link>
                {offer.url && (
                  <a href={offer.url} className="ml-2 text-xs text-slate-400 hover:underline">
                    сайт ↗
                  </a>
                )}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <div className={offer.isOnPromo ? 'font-semibold text-red-700' : 'font-semibold'}>
                  {formatPrice(offer.currentPrice, offer.currency)}
                </div>
                {offer.regularPrice !== null && (
                  <div className="text-xs text-slate-400 line-through">
                    {formatPrice(offer.regularPrice, offer.currency)}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap text-slate-600">
                {offer.unitPrice !== null
                  ? `${formatPrice(offer.unitPrice, offer.currency)}/${offer.unitLabel}`
                  : '—'}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  {offer.matchMethod && <StatusBadge status={offer.matchMethod} />}
                  {offer.matchMethod === 'FUZZY' && (
                    <span className="text-xs text-slate-500">{formatScore(offer.matchScore)}</span>
                  )}
                  {offers.length > 1 && (
                    <MatchingAction
                      action={{ kind: 'unlink', listingId: offer.id }}
                      label="Відвʼязати"
                      variant="danger"
                      confirm={`Картка «${offer.name}» (${offer.chainName}) — не цей товар?`}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

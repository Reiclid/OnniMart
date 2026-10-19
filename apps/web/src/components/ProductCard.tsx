import Link from 'next/link';
import type { ListingSummaryDto } from '@/api/generated/model';
import { formatMoney } from '@/lib/format';
import { ProductImage } from './ui';

/** Картка акції: фото, назва, ціна зі старою ціною, мережа (Figma: Product card) */
export function ProductCard({ listing }: { listing: ListingSummaryDto }) {
  const { currentPrice, regularPrice, currency } = listing;
  const discount =
    currentPrice !== null && regularPrice !== null ? Math.round((1 - currentPrice / regularPrice) * 100) : null;
  return (
    <Link
      href={listing.productId ? `/products/${listing.productId}` : (listing.url ?? '#')}
      className="flex w-40 shrink-0 flex-col gap-2 rounded-lg border border-line bg-surface p-3 hover:border-line-strong sm:w-auto"
    >
      <div className="relative">
        <ProductImage src={listing.imageUrl} className="h-28 w-full" />
        {discount !== null && discount > 0 && (
          <span className="absolute left-0 top-0 rounded-sm bg-danger px-1.5 py-0.5 text-caption font-semibold text-white">
            −{discount}%
          </span>
        )}
      </div>
      <span className="line-clamp-2 text-body">{listing.name}</span>
      {currentPrice !== null && (
        <span className="mt-auto flex items-baseline gap-2">
          <span className="text-title-sm font-semibold text-danger">{formatMoney(currentPrice, currency)}</span>
          {regularPrice !== null && (
            <span className="text-body-sm text-fg-muted line-through">{formatMoney(regularPrice, currency)}</span>
          )}
        </span>
      )}
      <span className="text-caption text-fg-muted">{listing.chainName}</span>
    </Link>
  );
}

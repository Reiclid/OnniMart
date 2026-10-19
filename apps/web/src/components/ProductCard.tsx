import Link from 'next/link';
import type { ListingSummaryDto, ProductSummaryDto } from '@/api/generated/model';
import { formatMoney } from '@/lib/format';
import { ProductImage } from './ui';

export interface ProductCardData {
  id: string;
  href: string;
  imageUrl: string | null;
  name: string;
  price: number | null;
  oldPrice?: number | null;
  currency: string;
  /** "from" перед ціною: у товару кілька фасувань */
  from?: boolean;
  caption: string;
}

/** Картка товару: фото, назва, ціна (стара ціна й знижка), мережа (Figma: Product card) */
export function ProductCard({ card }: { card: ProductCardData }) {
  const { price, oldPrice, currency } = card;
  const discount = price !== null && oldPrice ? Math.round((1 - price / oldPrice) * 100) : 0;
  return (
    <Link
      href={card.href}
      className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 hover:border-line-strong"
    >
      <div className="relative">
        <ProductImage src={card.imageUrl} className="h-28 w-full" />
        {discount > 0 && (
          <span className="absolute left-0 top-0 rounded-sm bg-danger px-1.5 py-0.5 text-caption font-semibold text-white">
            −{discount}%
          </span>
        )}
      </div>
      <span className="line-clamp-2 text-body">{card.name}</span>
      {price !== null && (
        <span className="mt-auto flex flex-wrap items-baseline gap-x-2">
          {card.from && <span className="text-body-sm text-fg-muted">from</span>}
          <span className={`text-title-sm font-semibold ${discount > 0 ? 'text-danger' : ''}`}>{formatMoney(price, currency)}</span>
          {discount > 0 && <span className="text-body-sm text-fg-muted line-through">{formatMoney(oldPrice!, currency)}</span>}
        </span>
      )}
      <span className="text-caption text-fg-muted">{card.caption}</span>
    </Link>
  );
}

export const listingCard = (l: ListingSummaryDto): ProductCardData => ({
  id: l.id,
  href: l.productId ? `/products/${l.productId}` : (l.url ?? '#'),
  imageUrl: l.imageUrl,
  name: l.name,
  price: l.currentPrice,
  oldPrice: l.regularPrice,
  currency: l.currency,
  caption: l.chainName,
});

// Ціни в кількох валютах (UA, DE) — у картці лише перша, решта на сторінці товару
export const productCard = (p: ProductSummaryDto): ProductCardData => ({
  id: p.id,
  href: `/products/${p.id}`,
  imageUrl: p.imageUrl,
  name: p.name,
  price: p.prices[0]?.min ?? null,
  currency: p.prices[0]?.currency ?? 'UAH',
  from: p.variantsCount > 1,
  caption: p.prices[0] ? `Cheapest at ${p.prices[0].minChain}` : '',
});

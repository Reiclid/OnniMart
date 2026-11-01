import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { ListingSummaryDto, ProductSummaryDto } from '@/api/generated/model';
import type { T } from '@/i18n';
import type { Money } from '@/lib/country';
import { formatShown } from '@/lib/format';
import { ProductImage } from './ui';

export interface ProductCardData {
  id: string;
  href: string;
  imageUrl: string | null;
  name: string;
  price: number | null;
  oldPrice?: number | null;
  currency: string;
  /** Валюта показу: головний цінник перераховано, під ним справжня ціна мережі */
  money?: Money;
  /** "from" перед ціною (перекладене): у товару кілька фасувань */
  from?: string;
  caption: string;
}

/** Каскад появи: перші `limit` карток по черзі, решта (поза екраном) — без руху (docs/07-motion.md §4.2) */
export const cascade = (i: number, { limit = 4, stagger = 30, y = 12 } = {}) =>
  i >= 0 && i < limit
    ? { className: 'appear', style: { '--i': i, '--stagger': `${stagger}ms`, '--appear-y': `${y}px` } as CSSProperties }
    : undefined;

/** Картка товару: фото, назва, ціна (стара ціна й знижка), мережа (Figma: Product card) */
export function ProductCard({ card, motion }: { card: ProductCardData; motion?: ReturnType<typeof cascade> }) {
  const { price, oldPrice, currency, money } = card;
  const shown = price !== null ? formatShown(price, currency, money) : null;
  const discount = price !== null && oldPrice ? Math.round((1 - price / oldPrice) * 100) : 0;
  return (
    <Link
      href={card.href}
      style={motion?.style}
      className={`press-card flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 hover:border-line-strong ${motion?.className ?? ''}`}
    >
      <div className="relative">
        <ProductImage src={card.imageUrl} className="h-28 w-full" />
        {discount > 0 && (
          <span className="absolute left-0 top-0 rounded-sm bg-danger px-1.5 py-0.5 text-caption font-semibold text-white tabular-nums">
            −{discount}%
          </span>
        )}
      </div>
      <span className="line-clamp-2 text-body">{card.name}</span>
      {shown && (
        <span className="mt-auto flex flex-wrap items-baseline gap-x-2 tabular-nums">
          {card.from && <span className="text-body-sm text-fg-muted">{card.from}</span>}
          <span className={`text-title-sm font-semibold ${discount > 0 ? 'text-danger' : ''}`}>{shown.text}</span>
          {discount > 0 && (
            <span className="text-body-sm text-fg-muted line-through">{formatShown(oldPrice!, currency, money).text.replace('≈ ', '')}</span>
          )}
          {shown.original && <span className="basis-full text-body-sm text-fg-muted">{shown.original}</span>}
        </span>
      )}
      <span className="text-caption text-fg-muted">{card.caption}</span>
    </Link>
  );
}

export const listingCard = (l: ListingSummaryDto, money?: Money): ProductCardData => ({
  id: l.id,
  href: l.productId ? `/products/${l.productId}` : (l.url ?? '#'),
  imageUrl: l.imageUrl,
  name: l.name,
  price: l.currentPrice,
  oldPrice: l.regularPrice,
  currency: l.currency,
  money,
  caption: l.chainName,
});

// Ціни в кількох валютах (UA, DE) — у картці лише перша, решта на сторінці товару
export const productCard = (p: ProductSummaryDto, t: T, money?: Money): ProductCardData => ({
  id: p.id,
  href: `/products/${p.id}`,
  imageUrl: p.imageUrl,
  name: p.name,
  price: p.prices[0]?.min ?? null,
  currency: p.prices[0]?.currency ?? 'UAH',
  money,
  from: p.variantsCount > 1 ? t('card.from') : undefined,
  caption: p.prices[0] ? t('card.cheapestAt', { chain: p.prices[0].minChain }) : '',
});

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
  /** Найвища ціна серед мереж: картка показує діапазон "min – max" */
  maxPrice?: number | null;
  oldPrice?: number | null;
  currency: string;
  /** Валюта показу: головний цінник перераховано, під ним справжня ціна мережі */
  money?: Money;
  /** Мережа (найдешевша) — зліва внизу */
  caption: string;
  /** Справа внизу (перекладене): "lowest of 7" */
  note?: string;
}

/** Каскад появи: перші `limit` карток по черзі, решта (поза екраном) — без руху (docs/07-motion.md §4.2) */
export const cascade = (i: number, { limit = 4, stagger = 30, y = 12 } = {}) =>
  i >= 0 && i < limit
    ? { className: 'appear', style: { '--i': i, '--stagger': `${stagger}ms`, '--appear-y': `${y}px` } as CSSProperties }
    : undefined;

/** Картка товару (Figma: Product card C): фото зі знижкою, назва, ціна або діапазон, мережа й "найнижча з N" */
export function ProductCard({ card, motion }: { card: ProductCardData; motion?: ReturnType<typeof cascade> }) {
  const { price, maxPrice, oldPrice, currency, money } = card;
  const shown = price !== null ? formatShown(price, currency, money) : null;
  const max = maxPrice && price !== null && maxPrice > price ? formatShown(maxPrice, currency, money).text.replace('≈ ', '') : null;
  const discount = price !== null && oldPrice ? Math.round((1 - price / oldPrice) * 100) : 0;
  return (
    <Link
      href={card.href}
      style={motion?.style}
      className={`press-card flex flex-col items-center gap-2.5 rounded-xl border border-line-strong bg-surface px-2 pt-2 pb-3 text-center hover:border-fg-muted ${motion?.className ?? ''}`}
    >
      <div className="relative w-full p-2">
        <ProductImage src={card.imageUrl} className="h-31 w-full" />
        {discount > 0 && (
          <span className="absolute top-1 right-1 text-body-sm font-semibold text-danger tabular-nums">−{discount}%</span>
        )}
      </div>
      <div className="flex w-full flex-1 flex-col gap-2 px-1">
        <span className="line-clamp-2 text-body font-medium">{card.name}</span>
        {shown && (
          <span className="mt-auto flex flex-wrap items-baseline justify-center gap-x-1.5 tabular-nums">
            <span className={`whitespace-nowrap text-title-sm font-bold ${discount > 0 ? 'text-danger' : ''}`}>{shown.text}</span>
            {max && <span className="whitespace-nowrap text-title-sm font-bold">– {max}</span>}
            {discount > 0 && (
              <span className="whitespace-nowrap text-body-sm text-fg-muted line-through">{formatShown(oldPrice!, currency, money).text.replace('≈ ', '')}</span>
            )}
            {shown.original && <span className="basis-full text-caption text-fg-muted">{shown.original}</span>}
          </span>
        )}
        {(card.caption || card.note) && (
          <span className={`flex items-baseline justify-between gap-2 text-body-sm ${shown ? '' : 'mt-auto'}`}>
            <span className="truncate font-medium">{card.caption}</span>
            {card.note && <span className="shrink-0 text-fg-muted tabular-nums">{card.note}</span>}
          </span>
        )}
      </div>
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
  maxPrice: p.prices[0]?.max ?? null,
  currency: p.prices[0]?.currency ?? 'UAH',
  money,
  caption: p.prices[0]?.minChain ?? '',
  note: p.chainsCount > 1 ? t('card.lowestOf', { count: p.chainsCount }) : undefined,
});

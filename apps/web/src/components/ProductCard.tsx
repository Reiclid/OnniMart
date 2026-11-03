import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { ListingSummaryDto, ProductSummaryDto } from '@/api/generated/model';
import type { T } from '@/i18n';
import type { Money } from '@/lib/country';
import { formatShown, splitProductName } from '@/lib/format';
import { ProductImage } from './ui';

export interface ProductCardData {
  id: string;
  href: string;
  imageUrl: string | null;
  name: string;
  /** Тип продукту над назвою ("Напій газований"), коли назва мережі починається з нього (splitProductName) */
  kind?: string | null;
  price: number | null;
  /** Перед ціною (перекладене): "from" — коли в мережах чи розмірах є дорожчі. Діапазон "min – max" змішував
   *  розміри (0,33 л і 1,75 л) і не влазив у рядок на телефоні */
  from?: string;
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

/**
 * Картка товару (Figma: Product card C): фото зі знижкою, назва, ціна ("from" — якщо є дорожчі), мережа й "найнижча з N".
 * `bare` — без рамки, для білої сторінки каталогу (рамка лише при наведенні)
 */
export function ProductCard({ card, motion, bare }: { card: ProductCardData; motion?: ReturnType<typeof cascade>; bare?: boolean }) {
  const { price, oldPrice, currency, money } = card;
  const shown = price !== null ? formatShown(price, currency, money) : null;
  const discount = price !== null && oldPrice ? Math.round((1 - price / oldPrice) * 100) : 0;
  return (
    <Link
      href={card.href}
      style={motion?.style}
      className={`press-card flex flex-col items-center gap-2.5 rounded-xl border bg-surface px-2 pt-2 pb-3 text-center ${bare ? 'border-transparent hover:border-line' : 'border-line-strong hover:border-fg-muted'} ${motion?.className ?? ''}`}
    >
      <div className="relative w-full p-2">
        <ProductImage src={card.imageUrl} className="h-31 w-full" />
        {discount > 0 && (
          <span className="absolute top-1 right-1 text-body-sm font-semibold text-danger tabular-nums">−{discount}%</span>
        )}
      </div>
      <div className="flex w-full flex-1 flex-col gap-2 px-1">
        <span className="flex flex-col">
          {card.kind && <span className="truncate text-caption text-fg-muted first-letter:uppercase">{card.kind}</span>}
          <span className="line-clamp-2 text-body font-medium">{card.name}</span>
        </span>
        {shown && (
          <span className="mt-auto flex flex-wrap items-baseline justify-center gap-x-1.5 tabular-nums">
            {card.from && <span className="text-body-sm text-fg-muted">{card.from}</span>}
            <span className={`whitespace-nowrap text-title-sm font-bold ${discount > 0 ? 'text-danger' : ''}`}>{shown.text}</span>
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
export const productCard = (p: ProductSummaryDto, t: T, money?: Money): ProductCardData => {
  const { kind, title } = splitProductName(p.name, p.brand);
  return {
    id: p.id,
    href: `/products/${p.id}`,
    imageUrl: p.imageUrl,
    kind,
    name: title,
    price: p.prices[0]?.min ?? null,
    from: (p.prices[0]?.max ?? 0) > (p.prices[0]?.min ?? 0) ? t('card.from') : undefined,
    currency: p.prices[0]?.currency ?? 'UAH',
    money,
    caption: p.prices[0]?.minChain ?? '',
    note: p.chainsCount > 1 ? t('card.lowestOf', { count: p.chainsCount }) : undefined,
  };
};

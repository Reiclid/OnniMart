import type { ListingSummaryDto } from '@/api/generated/model';
import { getT } from '@/i18n/server';
import type { Money } from '@/lib/country';
import { formatShown, formatUnitPrice } from '@/lib/format';

/**
 * Ціна в одній мережі; найдешевша — bg/selected + border/brand (Figma: Chain price row).
 * `money` — валюта показу: праворуч цінник і ціна за одиницю перераховано («≈ 80.42 ₴»), ліворуч — справжня ціна мережі.
 */
export async function ChainPriceRow({ offer, cheapest, money }: { offer: ListingSummaryDto; cheapest?: boolean; money?: Money }) {
  const t = await getT();
  const unit = formatUnitPrice(offer, money);
  const price = offer.currentPrice !== null ? formatShown(offer.currentPrice, offer.currency, money) : null;
  const regular = offer.regularPrice !== null ? formatShown(offer.regularPrice, offer.currency, money).text.replace('≈ ', '') : null;
  const body = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-page text-body font-semibold text-fg-muted" aria-hidden>
        {offer.chainName.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-body font-semibold">
          {offer.chainName}
          {cheapest && (
            <span className="rounded-sm bg-brand px-1.5 py-0.5 text-caption font-semibold text-white">{t('chainRow.cheapest')}</span>
          )}
        </span>
        {offer.isOnPromo && <span className="block text-body-sm font-semibold text-danger">{t('chainRow.promo')}</span>}
        {/* Справжня ціна мережі — ліворуч, окремо від перерахованих цін праворуч */}
        {price?.original && <span className="block text-body-sm text-fg-muted tabular-nums">{t('chainRow.inStore', { price: price.original })}</span>}
      </span>
      <span className="text-right tabular-nums">
        <span className="flex items-baseline justify-end gap-2">
          {regular && <span className="text-body-sm text-fg-muted line-through">{regular}</span>}
          {price && <span className={`text-body font-semibold ${offer.isOnPromo ? 'text-danger' : ''}`}>{price.text}</span>}
        </span>
        {unit && <span className="block text-body-sm text-fg-muted">{unit}</span>}
      </span>
    </>
  );
  const className = `press-card flex items-center gap-3 rounded-lg border p-3 [--press-scale:0.99] ${
    cheapest ? 'border-accent bg-selected' : 'border-line bg-surface'
  }`;
  return offer.url ? (
    <a href={offer.url} target="_blank" rel="noopener noreferrer" className={`${className} hover:border-accent`}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}

import type { ListingSummaryDto } from '@/api/generated/model';
import { getT } from '@/i18n/server';
import { formatMoney, formatUnitPrice } from '@/lib/format';

/** Ціна в одній мережі; найдешевша — bg/selected + border/brand (Figma: Chain price row) */
export async function ChainPriceRow({ offer, cheapest }: { offer: ListingSummaryDto; cheapest?: boolean }) {
  const t = await getT();
  const unit = formatUnitPrice(offer);
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
        {offer.isOnPromo && <span className="text-body-sm font-semibold text-danger">{t('chainRow.promo')}</span>}
      </span>
      <span className="text-right">
        <span className="flex items-baseline justify-end gap-2">
          {offer.regularPrice !== null && (
            <span className="text-body-sm text-fg-muted line-through">{formatMoney(offer.regularPrice, offer.currency)}</span>
          )}
          {offer.currentPrice !== null && (
            <span className={`text-body font-semibold ${offer.isOnPromo ? 'text-danger' : ''}`}>
              {formatMoney(offer.currentPrice, offer.currency)}
            </span>
          )}
        </span>
        {unit && <span className="block text-body-sm text-fg-muted">{unit}</span>}
      </span>
    </>
  );
  const className = `flex items-center gap-3 rounded-lg border p-3 ${
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

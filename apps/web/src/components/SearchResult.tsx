import Link from 'next/link';
import type { ProductSummaryDto } from '@/api/generated/model';
import { formatMoney } from '@/lib/format';
import { ProductImage } from './ui';

/** Рядок пошуку: фото, назва, найнижча ціна і мережа, де вона (Figma: Search result) */
export function SearchResult({ product }: { product: ProductSummaryDto }) {
  // Ціни в кількох валютах (UA, DE) — у списку лише перша, решта на сторінці товару
  const price = product.prices[0];
  return (
    <Link
      href={`/products/${product.id}`}
      className="flex items-center gap-4 rounded-lg border border-line bg-surface p-3 hover:border-line-strong"
    >
      <ProductImage src={product.imageUrl} className="size-19 shrink-0 border border-line" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="line-clamp-2 text-body font-semibold">{product.name}</div>
        {price && (
          <>
            <div className="text-title-sm font-semibold text-brand">
              {product.variantsCount > 1 && <span className="text-body-sm font-normal text-fg-muted">from </span>}
              {formatMoney(price.min, price.currency)}
            </div>
            <span className="inline-block rounded-sm bg-selected px-2 py-0.5 text-caption font-semibold text-brand">
              Cheapest at {price.minChain}
            </span>
          </>
        )}
      </div>
    </Link>
  );
}

import { estimateCardHeight, masonryColumns } from '@/lib/masonry';
import { ProductCard, type ProductCardData, type cascade } from './ProductCard';

type Item = { card: ProductCardData; motion?: ReturnType<typeof cascade> };

/**
 * Список карток: на телефоні — дві колонки без пустот під нижчими картками (як у Pinterest),
 * від sm — звичайна сітка. Колонки там `display: contents`, а `order` повертає порядок рангу.
 */
export function ProductMasonry({ items }: { items: Item[] }) {
  const columns = masonryColumns(items.map((item) => estimateCardHeight(item.card)));
  return (
    <div className="flex items-start gap-3 sm:grid sm:grid-cols-3 lg:grid-cols-4">
      {columns.map((indexes, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col gap-3 sm:contents">
          {indexes.map((i) => (
            <div key={items[i].card.id} style={{ order: i }} className="flex flex-col *:flex-1">
              <ProductCard card={items[i].card} motion={items[i].motion} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

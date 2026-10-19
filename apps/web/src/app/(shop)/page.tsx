import { getCategories } from '@/api/generated/catalog/catalog';
import { getListings } from '@/api/generated/monitoring/monitoring';
import { FilterChips } from '@/components/FilterChips';
import { listingCard, ProductCard } from '@/components/ProductCard';
import { SearchField } from '@/components/SearchField';
import Link from 'next/link';
import { BellIcon } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [{ data: categories }, { data: deals }] = await Promise.all([
    getCategories(),
    getListings({ promo: true, matched: true, pageSize: 12 }),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        {/* На десктопі пошук — у шапці */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="flex-1">
            <SearchField />
          </div>
          <Link href="/alerts" aria-label="Alerts" className="grid size-13 place-items-center text-icon">
            <BellIcon width={24} height={24} />
          </Link>
        </div>
        <FilterChips
          label="Categories"
          param="category"
          items={categories.filter((c) => c.productsCount > 0).map((c) => ({ value: c.slug, label: c.name }))}
          filters={{}}
        />
      </div>

      <section className="space-y-3">
        <h1 className="text-title font-bold">Hot deals</h1>
        {deals.items.length === 0 ? (
          <p className="text-body text-fg-muted">No deals right now.</p>
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none] *:w-40 *:shrink-0 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 sm:*:w-auto lg:grid-cols-4">
            {deals.items.map((listing) => (
              <ProductCard key={listing.id} card={listingCard(listing)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

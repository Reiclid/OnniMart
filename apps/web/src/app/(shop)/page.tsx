import { getChains, getListings } from '@/api/generated/monitoring/monitoring';
import { ChainChips } from '@/components/ChainChips';
import { listingCard, ProductCard } from '@/components/ProductCard';
import { SearchField } from '@/components/SearchField';
import Link from 'next/link';
import { BellIcon } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [{ data: chains }, { data: deals }] = await Promise.all([
    getChains({ status: ['ACTIVE'] }),
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
        <ChainChips chains={chains} />
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

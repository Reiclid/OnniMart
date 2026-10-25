import { getCategories, getProducts } from '@/api/generated/catalog/catalog';
import { getRecommendations } from '@/api/generated/me/me';
import { getListings } from '@/api/generated/monitoring/monitoring';
import { FilterChips } from '@/components/FilterChips';
import { listingCard, ProductCard, productCard } from '@/components/ProductCard';
import { currentUser } from '@/lib/session';
import { SearchField } from '@/components/SearchField';
import { getT } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [user, t] = await Promise.all([currentUser(), getT()]);
  const [{ data: categories }, { data: deals }, picks] = await Promise.all([
    getCategories(),
    getListings({ promo: true, matched: true, pageSize: 12 }),
    // Увійшов — з категорій його підписок; гість — популярне в кількох мережах
    user
      ? getRecommendations().then((r) => r.data)
      : getProducts({ multiChain: true, pageSize: 8 }).then((r) => r.data.items),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        {/* На десктопі пошук — у шапці; дзвіночок — у таб-барі */}
        <div className="md:hidden">
          <SearchField />
        </div>
        <FilterChips
          param="category"
          items={categories.filter((c) => c.productsCount > 0).map((c) => ({ value: c.slug, label: c.name }))}
          filters={{}}
        />
      </div>

      <section className="space-y-3">
        <h1 className="text-title font-bold">{t('home.hotDeals')}</h1>
        {deals.items.length === 0 ? (
          <p className="text-body text-fg-muted">{t('home.noDeals')}</p>
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none] *:w-40 *:shrink-0 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 sm:*:w-auto lg:grid-cols-4">
            {deals.items.map((listing) => (
              <ProductCard key={listing.id} card={listingCard(listing)} />
            ))}
          </div>
        )}
      </section>

      {picks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-title font-bold">{t(user ? 'home.forYou' : 'home.popular')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {picks.map((product) => (
              <ProductCard key={product.id} card={productCard(product, t)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

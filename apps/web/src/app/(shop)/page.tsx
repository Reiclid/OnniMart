import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCategories, getProducts } from '@/api/generated/catalog/catalog';
import { getRecommendations } from '@/api/generated/me/me';
import { getListings } from '@/api/generated/monitoring/monitoring';
import { ConsentBanner } from '@/components/ConsentBanner';
import { FilterChips } from '@/components/FilterChips';
import { cascade, listingCard, ProductCard, productCard } from '@/components/ProductCard';
import { ProductMasonry } from '@/components/ProductMasonry';
import { currentCountry, currentMoney, currentUser, guestConsent, localized, recentlyViewed } from '@/lib/session';
import { INTERESTS_COOKIE, ONBOARDED_COOKIE, parseInterests, type Country } from '@/lib/country';
import { SearchField } from '@/components/SearchField';
import { getT } from '@/i18n/server';

export const dynamic = 'force-dynamic';

/** Стрічка, що гортається вбік на телефоні й стає сіткою від sm */
const carousel = '-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none] *:w-40 *:shrink-0 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 sm:*:w-auto lg:grid-cols-4';

export default async function HomePage() {
  const [user, t, country, jar] = await Promise.all([currentUser(), getT(), currentCountry(), cookies()]);
  // Перший візит гостя — спершу онбординг (Figma 14–16)
  if (!user && !jar.has(ONBOARDED_COOKIE)) redirect('/welcome');
  const [{ data: categories }, { data: deals }, picks, viewed, consent, money] = await Promise.all([
    getCategories(),
    getListings({ promo: true, matched: true, pageSize: 12, country }),
    // Увійшов — з категорій його підписок; гість — популярне в кількох мережах, спершу обрані категорії
    user
      ? getRecommendations().then((r) => localized(r.data, country))
      : guestPicks(country, parseInterests(jar.get(INTERESTS_COOKIE)?.value)),
    // Історія — не головне: збій не ламає головну
    recentlyViewed(user).catch(() => []),
    user ? null : guestConsent(),
    currentMoney(country),
  ]);

  return (
    <div data-white className="space-y-8">
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
          <div className={carousel}>
            {deals.items.map((listing, i) => (
              <ProductCard key={listing.id} card={listingCard(listing, money)} motion={cascade(i)} bare />
            ))}
          </div>
        )}
      </section>

      {viewed.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-title font-bold">{t('viewed.title')}</h2>
            <Link href="/profile/viewed" className="text-body-sm font-semibold text-brand">{t('home.seeAll')}</Link>
          </div>
          <div className={carousel}>
            {viewed.slice(0, 12).map((product) => (
              <ProductCard key={product.id} card={productCard(product, t, money)} bare />
            ))}
          </div>
        </section>
      )}

      {picks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-title font-bold">{t(user ? 'home.forYou' : 'home.popular')}</h2>
          {/* Каскад по рядках: рядок × 40 мс, лише перші 3 рядки */}
          <ProductMasonry bare items={picks.map((product, i) => ({ card: productCard(product, t, money), motion: cascade(Math.floor(i / 2), { limit: 3, stagger: 40 }) }))} />
        </section>
      )}

      {!user && consent === null && <ConsentBanner />}
    </div>
  );
}

/** «Popular» гостя: по 4 з кожної обраної категорії, решта — популярне; без повторів */
async function guestPicks(country: Country, interests: string[]) {
  const lists = await Promise.all([
    ...interests.slice(0, 3).map((category) => getProducts({ multiChain: true, category, pageSize: 4, country })),
    getProducts({ multiChain: true, pageSize: 8, country }),
  ]);
  const seen = new Set<string>();
  const items = lists.flatMap((r) => r.data.items).filter((p) => !seen.has(p.id) && seen.add(p.id));
  return localized(items.slice(0, 12), country);
}

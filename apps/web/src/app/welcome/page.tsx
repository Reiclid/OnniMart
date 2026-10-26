import { getCategories, getProduct, getProducts } from '@/api/generated/catalog/catalog';
import { ChainPriceRow } from '@/components/ChainPriceRow';
import { Onboarding } from '@/components/Onboarding';
import { INTL_LOCALE } from '@/i18n';
import { getLocale } from '@/i18n/server';
import { COUNTRIES, countryList, type Country } from '@/lib/country';
import { productView } from '@/lib/offers';
import { currentCountry } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Перший запуск (Figma 14–16 Onboarding): без шапки й таб-бару, кожен крок можна пропустити */
export default async function WelcomePage() {
  const [country, locale] = await Promise.all([currentCountry(), getLocale()]);
  const [{ data: categories }, offers] = await Promise.all([
    getCategories(),
    // Ілюстрація — не головне: без неї крок лишається
    heroOffers(country).catch(() => []),
  ]);

  return (
    <Onboarding
      defaultCountry={country}
      countries={countryList(INTL_LOCALE[locale])}
      categories={categories
        // «Інше» — залишок без категорії, його не обирають
        .filter((c) => c.productsCount > 0 && c.slug !== 'other')
        .sort((a, b) => b.productsCount - a.productsCount)
        .slice(0, 6)
        .map((c) => ({ slug: c.slug, name: c.name }))}
      hero={
        offers.length > 0 && (
          <div className="space-y-2 rounded-xl bg-selected p-4">
            {offers.map((offer, i) => (
              <ChainPriceRow key={offer.id} offer={offer} cheapest={i === 0} />
            ))}
          </div>
        )
      }
    />
  );
}

/** Справжній товар із кількох мереж країни: три найдешевші пропозиції у її валюті */
async function heroOffers(country: Country) {
  const { data } = await getProducts({ multiChain: true, pageSize: 1, country });
  const id = data.items[0]?.id;
  if (!id) return [];
  const { offers } = productView((await getProduct(id)).data);
  return offers
    .filter((o) => o.currency === COUNTRIES[country].currency && o.currentPrice !== null)
    .sort((a, b) => (a.currentPrice ?? 0) - (b.currentPrice ?? 0))
    .slice(0, 3)
    // Рядок-ілюстрація, не посилання на сайт мережі
    .map((o) => ({ ...o, url: null }));
}

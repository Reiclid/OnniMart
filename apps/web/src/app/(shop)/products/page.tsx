import { getCategories } from '@/api/generated/catalog/catalog';
import { getChains } from '@/api/generated/monitoring/monitoring';
import { CatalogFilters } from '@/components/CatalogFilters';
import { ProductGrid } from '@/components/ProductGrid';
import { SearchField } from '@/components/SearchField';
import { getT } from '@/i18n/server';
import { parseCatalogFilters } from '@/lib/catalog-filters';
import { PRODUCTS_PAGE_SIZE } from '@/lib/offers';
import { currentCountry, currentMoney, findProducts } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function SearchPage(props: PageProps<'/products'>) {
  const filters = parseCatalogFilters(await props.searchParams);
  const { q, chain, category, multiChain } = filters;

  const [products, { data: chains }, { data: categories }, t, country] = await Promise.all([
    findProducts({ ...filters, page: 1, pageSize: PRODUCTS_PAGE_SIZE }),
    getChains({ status: ['ACTIVE'] }),
    getCategories(),
    getT(),
    currentCountry(),
  ]);
  const money = await currentMoney(country);
  const categoryName = categories.find((c) => c.slug === category)?.name;

  return (
    // data-page — біла сторінка каталогу (globals.css): картки на ній без рамки
    <div data-page="catalog" className="space-y-4">
      <h1 className={categoryName ? 'text-title font-bold' : 'sr-only'}>{categoryName ?? (q ? t('catalog.resultsFor', { q }) : t('catalog.title'))}</h1>
      <div className="md:hidden">
        <SearchField key={q} q={q} filters={filters} />
      </div>
      <CatalogFilters
        filters={filters}
        categories={categories.filter((c) => c.productsCount > 0).map((c) => ({ value: c.slug, label: c.name, count: c.productsCount }))}
        chains={chains.filter((c) => c.countryCode === country).map((c) => ({ value: c.slug, label: c.name }))}
      />
      {products.items.length === 0 ? (
        <p className="py-10 text-center text-body text-fg-muted">{t('catalog.empty')}</p>
      ) : (
        // Новий запит або мережа — новий список з першої сторінки
        <ProductGrid key={`${q}|${chain}|${category}|${multiChain}`} first={products.items} total={products.total} filters={filters} money={money} />
      )}
    </div>
  );
}

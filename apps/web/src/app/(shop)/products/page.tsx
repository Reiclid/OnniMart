import { getCategories, getProducts } from '@/api/generated/catalog/catalog';
import { getChains } from '@/api/generated/monitoring/monitoring';
import { FilterChips } from '@/components/FilterChips';
import { ProductGrid } from '@/components/ProductGrid';
import { SearchField } from '@/components/SearchField';
import { getT } from '@/i18n/server';
import { PRODUCTS_PAGE_SIZE } from '@/lib/offers';

export const dynamic = 'force-dynamic';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

export default async function SearchPage(props: PageProps<'/products'>) {
  const params = await props.searchParams;
  const q = first(params.q);
  const chain = first(params.chain);
  const category = first(params.category);
  const filters = { q, chain, category };

  const [{ data: products }, { data: chains }, { data: categories }, t] = await Promise.all([
    getProducts({ ...filters, page: 1, pageSize: PRODUCTS_PAGE_SIZE }),
    getChains({ status: ['ACTIVE'] }),
    getCategories(),
    getT(),
  ]);
  const categoryName = categories.find((c) => c.slug === category)?.name;

  return (
    <div className="space-y-4">
      <h1 className={categoryName ? 'text-title font-bold' : 'sr-only'}>{categoryName ?? (q ? t('catalog.resultsFor', { q }) : t('catalog.title'))}</h1>
      <div className="md:hidden">
        <SearchField q={q} />
      </div>
      <FilterChips
        param="category"
        items={categories.filter((c) => c.productsCount > 0).map((c) => ({ value: c.slug, label: c.name }))}
        filters={filters}
      />
      <FilterChips param="chain" items={chains.map((c) => ({ value: c.slug, label: c.name }))} filters={filters} />
      {products.items.length === 0 ? (
        <p className="py-10 text-center text-body text-fg-muted">{t('catalog.empty')}</p>
      ) : (
        // Новий запит або мережа — новий список з першої сторінки
        <ProductGrid key={`${q}|${chain}|${category}`} first={products.items} total={products.total} filters={filters} />
      )}
    </div>
  );
}

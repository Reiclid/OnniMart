import Link from 'next/link';
import { getProducts } from '@/api/generated/catalog/catalog';
import { getChains } from '@/api/generated/monitoring/monitoring';
import { ChainChips } from '@/components/ChainChips';
import { SearchField } from '@/components/SearchField';
import { SearchResult } from '@/components/SearchResult';
import { buttonStyles } from '@/components/ui';

export const dynamic = 'force-dynamic';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

export default async function SearchPage(props: PageProps<'/products'>) {
  const params = await props.searchParams;
  const q = first(params.q);
  const chain = first(params.chain);
  const page = Number(first(params.page)) || 1;

  const [{ data: products }, { data: chains }] = await Promise.all([
    getProducts({ q, chain, page, pageSize: 20 }),
    getChains({ status: ['ACTIVE'] }),
  ]);
  const next = new URLSearchParams({ ...(q && { q }), ...(chain && { chain }), page: String(page + 1) });

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{q ? `Results for ${q}` : 'Catalog'}</h1>
      <SearchField q={q} />
      <ChainChips chains={chains} selected={chain} q={q} />
      {products.items.length === 0 ? (
        <p className="py-10 text-center text-body text-fg-muted">Nothing found. Try another name or the barcode digits.</p>
      ) : (
        <div className="space-y-3">
          {products.items.map((product) => (
            <SearchResult key={product.id} product={product} />
          ))}
        </div>
      )}
      {page * products.pageSize < products.total && (
        <Link href={`/products?${next}`} className={`${buttonStyles.secondary} w-full`}>
          More results
        </Link>
      )}
    </div>
  );
}

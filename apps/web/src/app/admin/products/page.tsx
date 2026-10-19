import Link from 'next/link';
import { getProducts } from '@/api/generated/catalog/catalog';
import type { GetProductsParams } from '@/api/generated/model';
import { getChains } from '@/api/generated/monitoring/monitoring';
import { formatNumber, formatPriceRange } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(params: SearchParams, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = first(value);
    if (v && key !== 'page') query.set(key, v);
  }
  query.set('page', String(page));
  return `/admin/products?${query.toString()}`;
}

export default async function ProductsPage(props: PageProps<'/admin/products'>) {
  const searchParams: SearchParams = await props.searchParams;
  // За замовчуванням — товари, що є в кількох мережах: саме їх і порівнюємо
  const multiChain = first(searchParams.all) !== 'true';
  const filters: GetProductsParams = {
    q: first(searchParams.q) || undefined,
    chain: first(searchParams.chain) || undefined,
    multiChain: multiChain || undefined,
    page: Number(first(searchParams.page) ?? 1) || 1,
    pageSize: PAGE_SIZE,
  };

  const [{ data: products }, { data: chains }] = await Promise.all([
    getProducts(filters),
    getChains(),
  ]);
  const from = products.total === 0 ? 0 : (products.page - 1) * products.pageSize + 1;
  const to = Math.min(products.page * products.pageSize, products.total);
  const lastPage = Math.max(Math.ceil(products.total / products.pageSize), 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Каталог</h1>
        <p className="text-sm text-slate-500">
          Один товар — ціни всіх мереж. Картки мереж обʼєднано за штрихкодом і схожістю назв.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <label className="flex min-w-64 flex-1 flex-col gap-1">
          <span className="text-xs text-slate-500">Назва, бренд або штрихкод</span>
          <input
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="моршинська, coca-cola, 4820017000024…"
            className="rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Мережа</span>
          <select
            name="chain"
            defaultValue={filters.chain ?? ''}
            className="rounded border border-slate-300 bg-white px-2 py-1.5"
          >
            <option value="">Усі</option>
            {chains.map((chain) => (
              <option key={chain.slug} value={chain.slug}>
                {chain.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 py-1.5">
          <input type="checkbox" name="all" value="true" defaultChecked={!multiChain} />
          Показати й товари лише однієї мережі
        </label>
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-1.5 font-medium text-white hover:bg-slate-700"
        >
          Знайти
        </button>
      </form>

      <p className="text-sm text-slate-500">
        Показано {formatNumber(from)}–{formatNumber(to)} з {formatNumber(products.total)}
        {multiChain && ' товарів, що продаються щонайменше у 2 мережах'}
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="w-16 px-3 py-2" />
              <th className="px-3 py-2">Товар</th>
              <th className="px-3 py-2">Мережі</th>
              <th className="px-3 py-2 text-right">Ціни</th>
              <th className="px-3 py-2 text-right">Фасувань</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.items.map((product) => (
              <tr key={product.id}>
                <td className="px-3 py-2">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- зображення з десятків доменів мереж
                    <img src={product.imageUrl} alt="" className="h-10 w-10 min-w-10 rounded object-contain" loading="lazy" />
                  ) : (
                    <div className="h-10 w-10 min-w-10 rounded bg-slate-100" />
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/admin/products/${product.id}`} className="font-medium text-blue-700 hover:underline">
                    {product.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {[product.brand, product.variantLabel].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{product.chainsCount}</div>
                  <div className="max-w-72 text-xs text-slate-500">{product.chains.join(', ')}</div>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {product.prices.map((range) => (
                    <div key={range.currency} className={product.onPromo ? 'text-red-700' : ''}>
                      {formatPriceRange(range)}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2 text-right">{product.variantsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.items.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">
            Нічого не знайдено. Якщо каталог порожній — запустіть зіставлення на сторінці «Зіставлення».
          </p>
        )}
      </div>

      <nav className="flex items-center justify-between text-sm">
        {products.page > 1 ? (
          <Link href={pageHref(searchParams, products.page - 1)} className="text-blue-700 hover:underline">
            ← Попередня
          </Link>
        ) : (
          <span />
        )}
        <span className="text-slate-500">
          Сторінка {products.page} з {lastPage}
        </span>
        {products.page < lastPage ? (
          <Link href={pageHref(searchParams, products.page + 1)} className="text-blue-700 hover:underline">
            Наступна →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}

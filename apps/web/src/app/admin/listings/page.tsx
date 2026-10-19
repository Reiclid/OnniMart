import Link from 'next/link';
import { getChains, getListings } from '@/api/generated/monitoring/monitoring';
import type { GetListingsParams } from '@/api/generated/model';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, formatNumber, formatPrice } from '@/lib/format';

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
  return `/admin/listings?${query.toString()}`;
}

export default async function ListingsPage(props: PageProps<'/admin/listings'>) {
  const searchParams: SearchParams = await props.searchParams;
  const filters: GetListingsParams = {
    chain: first(searchParams.chain) || undefined,
    q: first(searchParams.q) || undefined,
    promo: first(searchParams.promo) === 'true' || undefined,
    matched: first(searchParams.matched) === 'true' || undefined,
    page: Number(first(searchParams.page) ?? 1) || 1,
    pageSize: PAGE_SIZE,
  };

  const [{ data: listing }, { data: chains }] = await Promise.all([
    getListings(filters),
    getChains(),
  ]);
  const from = listing.total === 0 ? 0 : (listing.page - 1) * listing.pageSize + 1;
  const to = Math.min(listing.page * listing.pageSize, listing.total);
  const lastPage = Math.max(Math.ceil(listing.total / listing.pageSize), 1);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Товари мереж</h1>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
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
        <label className="flex min-w-64 flex-1 flex-col gap-1">
          <span className="text-xs text-slate-500">Назва, бренд або штрихкод</span>
          <input
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="coca-cola, 4820017000024…"
            className="rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="flex items-center gap-2 py-1.5">
          <input type="checkbox" name="promo" value="true" defaultChecked={filters.promo} />
          Лише акції
        </label>
        <label className="flex items-center gap-2 py-1.5">
          <input type="checkbox" name="matched" value="true" defaultChecked={filters.matched} />
          Лише зіставлені
        </label>
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-1.5 font-medium text-white hover:bg-slate-700"
        >
          Знайти
        </button>
      </form>

      <p className="text-sm text-slate-500">
        Показано {formatNumber(from)}–{formatNumber(to)} з {formatNumber(listing.total)}
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="w-16 px-3 py-2" />
              <th className="px-3 py-2">Товар</th>
              <th className="px-3 py-2">Мережа</th>
              <th className="px-3 py-2 text-right">Ціна</th>
              <th className="px-3 py-2 text-right">За одиницю</th>
              <th className="px-3 py-2">Штрихкод</th>
              <th className="px-3 py-2">Каталог</th>
              <th className="px-3 py-2">Оновлено</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {listing.items.map((item) => (
              <tr key={item.id} className={item.inStock ? '' : 'opacity-50'}>
                <td className="px-3 py-2">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- зображення з десятків доменів мереж
                    <img src={item.imageUrl} alt="" className="h-10 w-10 min-w-10 rounded object-contain" loading="lazy" />
                  ) : (
                    <div className="h-10 w-10 min-w-10 rounded bg-slate-100" />
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/admin/listings/${item.id}`} className="font-medium text-blue-700 hover:underline">
                    {item.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {[item.brand, item.quantityLabel].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{item.chainName}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <div className={item.isOnPromo ? 'font-semibold text-red-700' : 'font-semibold'}>
                    {formatPrice(item.currentPrice, item.currency)}
                  </div>
                  {item.regularPrice !== null && (
                    <div className="text-xs text-slate-400 line-through">
                      {formatPrice(item.regularPrice, item.currency)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-slate-600">
                  {item.unitPrice !== null
                    ? `${formatPrice(item.unitPrice, item.currency)}/${item.unitLabel}`
                    : '—'}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">
                  {item.barcodes[0] ?? '—'}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={item.matchStatus} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                  {formatDateTime(item.lastSeenAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {listing.items.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">Нічого не знайдено</p>
        )}
      </div>

      <nav className="flex items-center justify-between text-sm">
        {listing.page > 1 ? (
          <Link href={pageHref(searchParams, listing.page - 1)} className="text-blue-700 hover:underline">
            ← Попередня
          </Link>
        ) : (
          <span />
        )}
        <span className="text-slate-500">
          Сторінка {listing.page} з {lastPage}
        </span>
        {listing.page < lastPage ? (
          <Link href={pageHref(searchParams, listing.page + 1)} className="text-blue-700 hover:underline">
            Наступна →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}

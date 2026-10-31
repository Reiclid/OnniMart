import Link from 'next/link';
import { getBrandDuplicates, getBrands } from '@/api/generated/catalog/catalog';
import { BrandRowActions, MergePair } from '@/components/BrandControls';
import { formatNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const DUPLICATES_SHOWN = 15;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * Словник брендів: різні ключі брендів зіставлення вважає гарантовано різними товарами,
 * тож дублікат («SANPELLEGRINO» і «San Pellegrino») розділяє один товар на два.
 */
export default async function BrandsPage(props: PageProps<'/admin/brands'>) {
  const searchParams = await props.searchParams;
  const search = first(searchParams.search);
  const sort = first(searchParams.sort) === 'name' ? 'name' : 'products';
  const page = Number(first(searchParams.page) ?? 1) || 1;
  const [{ data }, { data: duplicates }] = await Promise.all([
    getBrands({ search, sort, page, pageSize: PAGE_SIZE }),
    getBrandDuplicates(),
  ]);
  const lastPage = Math.max(Math.ceil(data.total / data.pageSize), 1);
  const href = (patch: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ search, sort, page: 1, ...patch })) {
      if (v !== undefined && v !== '') params.set(k, String(v));
    }
    return `/admin/brands?${params}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Бренди <span className="text-slate-400">({formatNumber(data.total)})</span>
        </h1>
        <p className="text-sm text-slate-500">
          Бренд у зіставленні — це його <b>ключ</b> (транслітерована назва: «Галичина» → halychyna). Товари з різними
          ключами ніколи не обʼєднуються, тож дублікат бренду («SANPELLEGRINO» і «San Pellegrino», «PREMIA» і «Премія»)
          ділить один товар на два. <b>Злиття</b> переносить товари й лінійки дубліката до основного бренду, а ключ
          дубліката запамʼятовує як аліас: нові картки з ним одразу йдуть до основного. Злиття не скасовується.{' '}
          <b>Перейменування</b> змінює лише назву для показу; ключ лишається, і звʼязок з картками не рветься. Обидві
          дії запускають пакет зіставлення: ключі пошуку й пошуковий індекс оновляться за хвилину.
        </p>
      </div>

      {duplicates.length > 0 && (
        <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
          <h2 className="text-lg font-semibold">
            Можливі дублікати <span className="text-sm font-normal text-slate-500">({duplicates.length})</span>
          </h2>
          <p className="text-sm text-slate-500">
            Схожі назви. Не кожна пара — дублікат: «UP2FASHION MEN» і «WOMEN» — різні лінійки, «K-CLASSIC ASIA» —
            суббренд. Злийте лише той самий бренд, записаний по-різному.
          </p>
          <DuplicateTable items={duplicates.slice(0, DUPLICATES_SHOWN)} />
          {duplicates.length > DUPLICATES_SHOWN && (
            <details>
              <summary className="cursor-pointer text-sm text-slate-600">
                Ще {duplicates.length - DUPLICATES_SHOWN}
              </summary>
              <DuplicateTable items={duplicates.slice(DUPLICATES_SHOWN)} />
            </details>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <form className="flex gap-2 text-sm">
          <input type="hidden" name="sort" value={sort} />
          <input
            name="search"
            defaultValue={search}
            placeholder="Назва, ключ або аліас"
            className="w-64 rounded border border-slate-300 px-2 py-1"
          />
          <button className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">Знайти</button>
        </form>
        <span className="text-sm text-slate-500">
          Сортувати:{' '}
          {sort === 'products' ? (
            <b>за товарами</b>
          ) : (
            <Link href={href({ sort: 'products' })} className="text-blue-700 hover:underline">
              за товарами
            </Link>
          )}
          {' · '}
          {sort === 'name' ? (
            <b>за назвою</b>
          ) : (
            <Link href={href({ sort: 'name' })} className="text-blue-700 hover:underline">
              за назвою
            </Link>
          )}
        </span>
      </div>

      <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-3 py-2">Бренд</th>
            <th className="px-2">Ключ і аліаси</th>
            <th className="px-2 text-right">Товарів</th>
            <th className="px-2 text-right">Карток</th>
            <th className="px-2">Мережі</th>
            <th className="px-3" />
          </tr>
        </thead>
        <tbody>
          {data.items.map((b) => (
            <tr key={b.id} className="border-t border-slate-100 align-top">
              <td className="px-3 py-2">
                <Link href={`/admin/products?q=${encodeURIComponent(b.name)}`} className="font-medium hover:underline">
                  {b.name}
                </Link>
                {b.countries.length > 0 && (
                  <span className="ml-2 text-xs text-slate-400">{b.countries.join(', ')}</span>
                )}
              </td>
              <td className="px-2 py-2">
                <code className="text-xs">{b.slug}</code>
                {b.aliases.map((a) => (
                  <span
                    key={a}
                    className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                    title="Обʼєднаний дублікат"
                  >
                    ← {a}
                  </span>
                ))}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(b.products)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(b.listings)}</td>
              <td className="px-2 py-2 text-xs text-slate-600">{b.chains.join(', ')}</td>
              <td className="px-3 py-2 text-right">
                <BrandRowActions id={b.id} name={b.name} slug={b.slug} />
              </td>
            </tr>
          ))}
          {data.items.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                Нічого не знайдено.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {lastPage > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="text-blue-700 hover:underline">
              ← Попередня
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-500">
            Сторінка {page} з {lastPage}
          </span>
          {page < lastPage ? (
            <Link href={href({ page: page + 1 })} className="text-blue-700 hover:underline">
              Наступна →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function DuplicateTable({ items }: { items: Awaited<ReturnType<typeof getBrandDuplicates>>['data'] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {items.map((d) => (
          <tr key={`${d.source.id}${d.target.id}`} className="border-t border-amber-100">
            <td className="py-1.5">
              <b>{d.source.name}</b> <span className="text-slate-500">({d.source.products})</span>
              <span className="mx-2 text-slate-400">→</span>
              <b>{d.target.name}</b> <span className="text-slate-500">({d.target.products})</span>
            </td>
            <td className="px-2 text-right text-xs text-slate-500 tabular-nums">{Math.round(d.similarity * 100)} %</td>
            <td className="py-1.5 text-right">
              <MergePair source={d.source} target={d.target} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

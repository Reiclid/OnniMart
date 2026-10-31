import Link from 'next/link';
import { getVariations } from '@/api/generated/matching/matching';
import type { GetVariationsFilter, GetVariationsSort } from '@/api/generated/model';
import { AddVariationForm, VariationRowActions } from '@/components/VariationControls';
import { formatDateTime, formatNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const FILTERS: { value: GetVariationsFilter; label: string }[] = [
  { value: 'active', label: 'Діють' },
  { value: 'learned', label: 'Вивчені' },
  { value: 'added', label: 'Додані вручну' },
  { value: 'removed', label: 'Вимкнені' },
  { value: 'candidate', label: 'Кандидати' },
  { value: 'all', label: 'Усі' },
];
const SORTS: { value: GetVariationsSort; label: string }[] = [
  { value: 'products', label: 'товарами' },
  { value: 'contrast', label: 'контрастом' },
  { value: 'weight', label: 'вагою' },
  { value: 'word', label: 'абеткою' },
];
const STATUS: Record<string, { label: string; className: string }> = {
  learned: { label: 'вивчене', className: 'bg-blue-50 text-blue-700' },
  added: { label: 'додане', className: 'bg-green-50 text-green-700' },
  removed: { label: 'вимкнене', className: 'bg-red-50 text-red-700' },
  candidate: { label: 'кандидат', className: 'bg-slate-100 text-slate-600' },
};

/**
 * PRD-30: слова варіацій (смаки, сорти), вивчені з карток мереж, і ручні рішення.
 * Варіація розводить назви, що різняться лише нею, на різні товари.
 */
export default async function VariationsPage(props: PageProps<'/admin/variations'>) {
  const searchParams = await props.searchParams;
  const filter = (FILTERS.find((f) => f.value === first(searchParams.filter))?.value ??
    'active') as GetVariationsFilter;
  const sort = (SORTS.find((s) => s.value === first(searchParams.sort))?.value ?? 'products') as GetVariationsSort;
  const search = first(searchParams.search);
  const page = Number(first(searchParams.page) ?? 1) || 1;
  const { data } = await getVariations({
    filter,
    sort,
    search,
    page,
    pageSize: PAGE_SIZE,
  });
  const lastPage = Math.max(Math.ceil(data.total / data.pageSize), 1);
  const href = (patch: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({
      filter,
      sort,
      search,
      page: 1,
      ...patch,
    })) {
      if (v !== undefined && v !== '') params.set(k, String(v));
    }
    return `/admin/variations?${params}`;
  };
  const countOf = (f: GetVariationsFilter) =>
    f === 'active'
      ? data.counts.learned + data.counts.added
      : f === 'all'
        ? data.counts.learned + data.counts.added + data.counts.removed + data.counts.candidate
        : data.counts[f];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Слова варіацій</h1>
        <p className="text-sm text-slate-500">
          Варіація — слово, яке розрізняє різновиди одного товару (erdbeere, куркою, gouda): назви, що відрізняються
          лише нею, не обʼєднуються. Воркер вчить їх щогодини з карток: <b>контраст</b> — скільки разів мережа продає
          дві картки одного бренду й фасування, де це слово замінене іншим; <b>шум</b> — у скількох штрихкодах слово
          відрізняє назви того самого товару в різних мережах. Вчиться слово з контрастом ≥ {data.minContrast} і вагою
          контраст / (контраст + шум) ≥ {data.minWeight}.{' '}
          {data.builtAt
            ? `Востаннє: ${formatDateTime(data.builtAt)}.`
            : 'Воркер ще не вивчав словник — запустіть зіставлення.'}{' '}
          Ручне рішення діє з наступного пакета зіставлення; перевірити чергу модерації з новими словами —{' '}
          <code>bun run match:recheck</code>.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <AddVariationForm />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={href({ filter: f.value })}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              f.value === filter ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600'
            }`}
          >
            {f.label} <span className="text-slate-400">{formatNumber(countOf(f.value))}</span>
          </Link>
        ))}
        <form className="ml-auto flex gap-2 text-sm">
          <input type="hidden" name="filter" value={filter} />
          <input type="hidden" name="sort" value={sort} />
          <input
            name="search"
            defaultValue={search}
            placeholder="Пошук слова"
            className="rounded border border-slate-300 px-2 py-1"
          />
          <button className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">Знайти</button>
        </form>
      </div>

      <p className="text-sm text-slate-500">
        Сортувати за:{' '}
        {SORTS.map((s, i) => (
          <span key={s.value}>
            {i > 0 && ' · '}
            {s.value === sort ? (
              <b>{s.label}</b>
            ) : (
              <Link href={href({ sort: s.value })} className="text-blue-700 hover:underline">
                {s.label}
              </Link>
            )}
          </span>
        ))}
        {' · '}знайдено {formatNumber(data.total)}
      </p>

      <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-3 py-2">Слово</th>
            <th className="px-2 text-right">Товарів</th>
            <th className="px-2 text-right">Карток</th>
            <th className="px-2 text-right" title="Скільки разів слово — єдина відмінність двох карток однієї мережі">
              Контраст
            </th>
            <th className="px-2 text-right" title="У скількох штрихкодах слово відрізняє назви того самого товару">
              Шум
            </th>
            <th className="px-2 text-right">Вага</th>
            <th className="px-2">Приклади</th>
            <th className="px-3" />
          </tr>
        </thead>
        <tbody>
          {data.items.map((w) => (
            <tr key={w.word} className={`border-t border-slate-100 align-top ${w.active ? '' : 'text-slate-500'}`}>
              <td className="px-3 py-2">
                <Link href={`/admin/listings?q=${encodeURIComponent(w.word)}`} className="font-medium hover:underline">
                  {w.word}
                </Link>
                <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${STATUS[w.status].className}`}>
                  {STATUS[w.status].label}
                </span>
                {w.note && <div className="text-xs text-slate-500">{w.note}</div>}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(w.products)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(w.listings)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{w.contrast}</td>
              <td className="px-2 py-2 text-right tabular-nums">{w.noise}</td>
              <td className="px-2 py-2 text-right tabular-nums">{w.weight === null ? '—' : w.weight.toFixed(2)}</td>
              <td className="px-2 py-2 text-xs text-slate-600">{w.examples.join(' · ')}</td>
              <td className="px-3 py-2 text-right">
                <VariationRowActions word={w.word} status={w.status} />
              </td>
            </tr>
          ))}
          {data.items.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
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

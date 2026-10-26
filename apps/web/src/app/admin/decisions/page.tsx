import Link from 'next/link';
import { getDecisions } from '@/api/generated/matching/matching';
import type { DecisionDto } from '@/api/generated/model';
import { Thumb } from '@/components/Compare';
import { MatchingAction } from '@/components/MatchingAction';
import { formatDateTime, formatNumber, formatPrice, formatScore } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;
const TABS = [
  { kind: 'match', label: 'Зіставлення карток' },
  { kind: 'barcode', label: 'Штрихкоди OFF' },
] as const;

/** Журнал рішень модераторів: що з чим обʼєднали чи відхилили — і скасування */
export default async function DecisionsPage(props: PageProps<'/admin/decisions'>) {
  const searchParams = await props.searchParams;
  const kind = searchParams.kind === 'barcode' ? 'barcode' : 'match';
  const page = Number(searchParams.page ?? 1) || 1;
  const { data } = await getDecisions({ kind, page, pageSize: PAGE_SIZE });
  const lastPage = Math.max(Math.ceil(data.total / data.pageSize), 1);
  const href = (p: number) => `/admin/decisions?kind=${kind}&page=${p}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Рішення модераторів</h1>
        <p className="text-sm text-slate-500">
          Найновіші першими. «Скасувати» повертає картку (або фасування — для штрихкодів OFF) у чергу з тими
          самими кандидатами: обʼєднання розʼєднується, товар, створений після відхилення, прибирається.
        </p>
      </div>

      <nav className="flex gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.kind}
            href={`/admin/decisions?kind=${tab.kind}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              tab.kind === kind ? 'border-blue-600 bg-blue-50 font-medium text-blue-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </Link>
        ))}
        <span className="self-center text-sm text-slate-400">{formatNumber(data.total)}</span>
      </nav>

      {data.items.length === 0 ? (
        <p className="text-sm text-slate-500">Рішень ще немає.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Коли</th>
                <th className="px-4 py-2">Рішення</th>
                <th className="px-4 py-2">{kind === 'match' ? 'Картка мережі' : 'Товар OFF'}</th>
                <th className="px-4 py-2">Товар у каталозі</th>
                <th className="px-4 py-2 text-right">Схожість</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((d) => (
                <DecisionRow key={d.id} d={d} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lastPage > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="text-blue-700 hover:underline">← Новіші</Link> : <span />}
          <span className="text-slate-500">
            Сторінка {page} з {lastPage}
          </span>
          {page < lastPage ? <Link href={href(page + 1)} className="text-blue-700 hover:underline">Старіші →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

function Verdict({ d }: { d: DecisionDto }) {
  if (d.unlinked) return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">відвʼязано</span>;
  return d.status === 'ACCEPTED' ? (
    <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700">✓ той самий товар</span>
  ) : (
    <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">✕ не підходить</span>
  );
}

function DecisionRow({ d }: { d: DecisionDto }) {
  return (
    <tr className="align-top">
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(d.decidedAt)}</td>
      <td className="px-4 py-3">
        <Verdict d={d} />
      </td>
      <td className="px-4 py-3">
        {d.listing ? (
          <div className="flex gap-3">
            <Thumb src={d.listing.imageUrl} small />
            <div>
              <div className="text-xs text-slate-500">{d.listing.chainName}</div>
              <Link href={`/admin/listings/${d.listing.id}`} className="font-medium text-blue-700 hover:underline">
                {d.listing.name}
              </Link>
              <div className="text-xs text-slate-600">{formatPrice(d.listing.price, d.listing.currency)}</div>
            </div>
          </div>
        ) : (
          <div>
            <a href={`https://world.openfoodfacts.org/product/${d.gtin}`} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">
              {d.offName}
            </a>
            <div className="font-mono text-xs text-slate-500">{d.gtin}</div>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {d.product ? (
          <div className="flex gap-3">
            <Thumb src={d.product.imageUrl} small />
            <div>
              <div className="text-xs text-slate-500">{[d.product.brand, d.product.variantLabel].filter(Boolean).join(' · ')}</div>
              <Link href={`/admin/products/${d.product.id}`} className="font-medium hover:underline">
                {d.product.name}
              </Link>
            </div>
          </div>
        ) : (
          <span className="text-xs text-slate-400">товар уже видалено</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{formatScore(d.score)}</td>
      <td className="px-4 py-3 text-right">
        {!d.unlinked && (
          <MatchingAction
            action={{ kind: 'undo', decisionId: d.id, decision: d.kind === 'barcode' ? 'barcode' : 'match' }}
            label="Скасувати"
            variant="secondary"
            confirm={
              d.status === 'ACCEPTED'
                ? 'Розʼєднати й повернути в чергу модерації?'
                : 'Повернути в чергу модерації з тими самими кандидатами?'
            }
          />
        )}
      </td>
    </tr>
  );
}

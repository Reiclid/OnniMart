import Link from 'next/link';
import { getBarcodeReviewQueue } from '@/api/generated/matching/matching';
import type { BarcodeReviewItemDto } from '@/api/generated/model';
import { CompareRow, Highlight, Thumb, Verdict } from '@/components/Compare';
import { MatchingAction } from '@/components/MatchingAction';
import { sameValue } from '@/lib/compare';
import { formatNumber, formatScore } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

/** PRD-27: сумнівні збіги фасувань без штрихкоду мереж з товарами Open Food Facts */
export default async function BarcodesPage(props: PageProps<'/admin/barcodes'>) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page ?? 1) || 1;
  const { data: queue } = await getBarcodeReviewQueue({ page, pageSize: PAGE_SIZE });
  const lastPage = Math.max(Math.ceil(queue.total / queue.pageSize), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Штрихкоди з Open Food Facts <span className="text-slate-400">({formatNumber(queue.total)})</span>
        </h1>
        <p className="text-sm text-slate-500">
          Фасування, чиї мережі не публікують штрихкод (ALDI, VARUS). Однозначні збіги приписуються
          автоматично (<code>bun run off:match -- --write</code>), тут — сумнівні: оберіть товар OFF, якщо
          це той самий товар і фасування. Хибний штрихкод гірший за жоден.
          Жовтим підсвічено слова назви OFF, яких немає ні в назві товару, ні в картках мереж. У фасування
          буває кілька штрихкодів (ALDI Nord і SÜD, стара й нова упаковка): «Той самий товар» приймає лише цей
          кандидат, решта лишаються — вирішіть кожного або натисніть «Жоден не підходить».
        </p>
      </div>

      {queue.items.length === 0 && <p className="text-sm text-slate-500">Черга порожня.</p>}
      {queue.items.map((item) => (
        <BarcodeCard key={item.variantId} item={item} />
      ))}

      {lastPage > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={`/admin/barcodes?page=${page - 1}`} className="text-blue-700 hover:underline">
              ← Попередня
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-500">
            Сторінка {page} з {lastPage}
          </span>
          {page < lastPage ? (
            <Link href={`/admin/barcodes?page=${page + 1}`} className="text-blue-700 hover:underline">
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

/** «Бренди · назва» з OFF → бренди й назва окремо */
function splitOff(offName: string): { brands: string[]; name: string } {
  const at = offName.indexOf(' · ');
  return at < 0
    ? { brands: [], name: offName }
    : { brands: offName.slice(0, at).split(',').map((b) => b.trim()), name: offName.slice(at + 3) };
}

/** Фасування з каталогу зліва, товари Open Food Facts праворуч — поле до поля */
function BarcodeCard({ item }: { item: BarcodeReviewItemDto }) {
  const ours = [item.productName, ...item.listings.map((l) => l.name)].join(' ');
  const offs = item.candidates.map((c) => ({ ...c, ...splitOff(c.offName) }));
  return (
    <article className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            <th className="w-28 bg-slate-50" />
            <th className="bg-blue-50/40 px-3 py-2 text-left">
              <span className="text-xs font-medium text-blue-800">Наш товар</span>
            </th>
            {offs.map((c, i) => (
              <th key={c.id} className="px-3 py-2 text-left font-normal">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500">Open Food Facts {i + 1}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${c.score >= 0.8 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    схожість {formatScore(c.score)}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <CompareRow
            label="Фото"
            cells={[
              <Thumb key="l" src={item.imageUrl} />,
              ...offs.map((c) => (
                <div key={c.id} className="space-y-1">
                  <Thumb src={c.imageUrl} />
                  <a href={`https://world.openfoodfacts.org/product/${c.gtin}`} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline">
                    Склад і всі фото в OFF ↗
                  </a>
                </div>
              )),
            ]}
          />
          <CompareRow
            label="Назва"
            cells={[
              <div key="l" className="space-y-1">
                <Link href={`/admin/products/${item.productId}`} className="font-medium text-blue-700 hover:underline">
                  {item.productName}
                </Link>
                <ul className="space-y-0.5 text-xs text-slate-600">
                  {item.listings.map((l, i) => (
                    <li key={i}>
                      <span className="font-medium">{l.chainName}:</span> {l.name}
                    </li>
                  ))}
                </ul>
              </div>,
              ...offs.map((c) => (
                <span key={c.id} className="font-medium">
                  <Highlight text={c.name} other={ours} />
                </span>
              )),
            ]}
          />
          <CompareRow
            label="Бренд"
            cells={[
              item.brand ?? '—',
              ...offs.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2">
                  {c.brands.join(', ') || '—'}
                  <Verdict same={item.brand && c.brands.length ? c.brands.some((b) => sameValue(b, item.brand)) : null} />
                </div>
              )),
            ]}
          />
          <CompareRow
            label="Фасування"
            cells={[
              item.variantLabel,
              ...offs.map((c) => (
                <span key={c.id} className="rounded bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700">
                  ✓ збігається (умова для кандидата)
                </span>
              )),
            ]}
          />
          <CompareRow
            label="Штрихкод"
            cells={[
              item.barcodes.length ? (
                <div key="l" className="space-y-0.5">
                  {item.barcodes.map((g) => (
                    <div key={g} className="font-mono text-xs text-green-700">
                      ✓ {g}
                    </div>
                  ))}
                </div>
              ) : (
                'немає'
              ),
              ...offs.map((c) => <span key={c.id} className="font-mono text-xs">{c.gtin}</span>),
            ]}
          />
          <CompareRow
            label="Рішення"
            cells={[
              <MatchingAction key="l" action={{ kind: 'reject-barcodes', variantId: item.variantId }} label="Жоден не підходить" variant="secondary" />,
              ...offs.map((c) => (
                <MatchingAction key={c.id} action={{ kind: 'accept-barcode', candidateId: c.id }} label="✓ Той самий товар" variant="success" />
              )),
            ]}
          />
        </tbody>
      </table>
    </article>
  );
}

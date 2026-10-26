import Link from 'next/link';
import { getBarcodeReviewQueue } from '@/api/generated/matching/matching';
import type { BarcodeReviewItemDto } from '@/api/generated/model';
import { MatchingAction } from '@/components/MatchingAction';
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

function BarcodeCard({ item }: { item: BarcodeReviewItemDto }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-100 p-4">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- зображення з сайту мережі
          <img src={item.imageUrl} alt="" className="h-14 w-14 rounded object-contain" loading="lazy" />
        ) : (
          <div className="h-14 w-14 rounded bg-slate-100" />
        )}
        <div className="min-w-64 flex-1">
          <div className="text-xs text-slate-500">{[item.brand, item.variantLabel].filter(Boolean).join(' · ')}</div>
          <Link href={`/admin/products/${item.productId}`} className="font-medium text-blue-700 hover:underline">
            {item.productName}
          </Link>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {item.listings.map((l, i) => (
              <li key={i}>
                <span className="font-medium">{l.chainName}:</span> {l.name}
              </li>
            ))}
          </ul>
        </div>
        <MatchingAction action={{ kind: 'reject-barcodes', variantId: item.variantId }} label="Жоден не підходить" variant="secondary" />
      </header>
      <ul className="divide-y divide-slate-100">
        {item.candidates.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="w-16 text-center">
              <div className="text-lg font-semibold">{formatScore(c.score)}</div>
              <div className="text-xs text-slate-400">схожість</div>
            </div>
            <div className="min-w-64 flex-1">
              <a
                href={`https://world.openfoodfacts.org/product/${c.gtin}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-700 hover:underline"
              >
                {c.offName}
              </a>
              <div className="font-mono text-xs text-slate-500">{c.gtin}</div>
            </div>
            <MatchingAction action={{ kind: 'accept-barcode', candidateId: c.id }} label="Це той самий товар" variant="success" />
          </li>
        ))}
      </ul>
    </article>
  );
}

import Link from 'next/link';
import {
  getMatchingStatus,
  getReviewQueue,
} from '@/api/generated/matching/matching';
import type { ReviewItemDto } from '@/api/generated/model';
import { AutoRefresh } from '@/components/AutoRefresh';
import { CompareRow, Highlight, Thumb, Verdict } from '@/components/Compare';
import { MatchingAction } from '@/components/MatchingAction';
import { sameValue } from '@/lib/compare';
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPrice,
  formatScore,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export default async function MatchingPage(props: PageProps<'/admin/matching'>) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page ?? 1) || 1;
  const [{ data: status }, { data: queue }] = await Promise.all([
    getMatchingStatus(),
    getReviewQueue({ page, pageSize: PAGE_SIZE }),
  ]);
  const lastPage = Math.max(Math.ceil(queue.total / queue.pageSize), 1);
  const methods = Object.fromEntries(status.byMethod.map((m) => [m.method, m.count]));
  const report = status.lastReport;

  const cards = [
    { label: 'Товарів у каталозі', value: formatNumber(status.products) },
    { label: 'Фасувань у 2+ мережах', value: formatNumber(status.multiChainVariants) },
    { label: 'За штрихкодом', value: formatNumber(methods.BARCODE ?? 0) },
    { label: 'За схожістю назви', value: formatNumber(methods.FUZZY ?? 0) },
    { label: 'Підтверджено модератором', value: formatNumber(methods.MANUAL ?? 0) },
    { label: 'На модерації', value: formatNumber(status.inReview) },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Зіставлення</h1>
          <p className="text-sm text-slate-500">
            Штрихкод → схожість назви ≥ 90 % → модерація 70–90 % → новий товар. Запускається
            автоматично після кожного парсингу. У черзі зліва — нова картка мережі, праворуч —
            кандидати з каталогу; жовтим підсвічено слова, яких немає в картці.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AutoRefresh active={status.running} />
          <MatchingAction
            action={{ kind: 'run' }}
            label={status.running ? 'Зіставлення йде…' : 'Зіставити зараз'}
          />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">{card.label}</div>
            <div className="mt-1 text-2xl font-semibold">{card.value}</div>
          </div>
        ))}
      </section>

      {report && (
        <p className="text-sm text-slate-600">
          Останній запуск {formatDateTime(report.startedAt)} ({formatDuration(report.startedAt, report.finishedAt)}):
          розглянуто {formatNumber(report.processed)} карток — штрихкод {report.byBarcode}, схожість{' '}
          {report.fuzzy}, на модерацію {report.review}, нових фасувань {report.newVariants}, нових
          товарів {report.newProducts}.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Черга модерації <span className="text-slate-400">({formatNumber(queue.total)})</span>
        </h2>
        {queue.items.length === 0 && (
          <p className="text-sm text-slate-500">Черга порожня — усі спірні картки розглянуто.</p>
        )}
        {queue.items.map((item) => (
          <ReviewCard key={item.listing.id} item={item} />
        ))}
        {lastPage > 1 && (
          <nav className="flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={`/admin/matching?page=${page - 1}`} className="text-blue-700 hover:underline">
                ← Попередня
              </Link>
            ) : (
              <span />
            )}
            <span className="text-slate-500">
              Сторінка {page} з {lastPage}
            </span>
            {page < lastPage ? (
              <Link href={`/admin/matching?page=${page + 1}`} className="text-blue-700 hover:underline">
                Наступна →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </div>
  );
}

/**
 * Картка мережі без товару і кандидати з каталогу поруч, поле до поля: зліва — нова картка,
 * праворуч — товари, з якими її можна обʼєднати. Відмінні слова й поля підсвічені.
 */
function ReviewCard({ item }: { item: ReviewItemDto }) {
  const { listing, candidates } = item;
  const head = (c: (typeof candidates)[number], i: number) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-slate-500">Кандидат {i + 1}</span>
      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${c.score >= 0.8 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
        схожість {formatScore(c.score)}
      </span>
    </div>
  );
  return (
    <article className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            <th className="w-28 bg-slate-50" />
            <th className="bg-blue-50/40 px-3 py-2 text-left">
              <span className="text-xs font-medium text-blue-800">Нова картка · {listing.chainName}</span>
            </th>
            {candidates.map((c, i) => (
              <th key={c.id} className="px-3 py-2 text-left font-normal">
                {head(c, i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <CompareRow label="Фото" cells={[<Thumb key="l" src={listing.imageUrl} />, ...candidates.map((c) => <Thumb key={c.id} src={c.imageUrl} />)]} />
          <CompareRow
            label="Назва"
            cells={[
              <Link key="l" href={`/admin/listings/${listing.id}`} className="font-medium text-blue-700 hover:underline">
                {listing.name}
              </Link>,
              ...candidates.map((c) => (
                <div key={c.id} className="space-y-1">
                  <Link href={`/admin/products/${c.productId}`} className="font-medium hover:underline">
                    <Highlight text={c.productName} other={listing.name} />
                  </Link>
                  {c.nameScore !== null && <div className="text-xs text-slate-500">схожість назв {formatScore(c.nameScore)}</div>}
                </div>
              )),
            ]}
          />
          <CompareRow
            label="Бренд"
            cells={[
              listing.brand ?? '—',
              ...candidates.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2">
                  {c.brand ?? '—'} <Verdict same={sameValue(listing.brand, c.brand)} />
                </div>
              )),
            ]}
          />
          <CompareRow
            label="Фасування"
            cells={[
              listing.quantityLabel ?? '—',
              ...candidates.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2">
                  {c.variantLabel} <Verdict same={sameValue(listing.quantityLabel, c.variantLabel)} />
                </div>
              )),
            ]}
          />
          <CompareRow
            label="Штрихкод"
            cells={[
              '',
              ...candidates.map((c) =>
                c.barcodeMismatch ? (
                  <span key={c.id} className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">≠ різні штрихкоди</span>
                ) : (
                  <span key={c.id} className="text-xs text-slate-400">не суперечить</span>
                ),
              ),
            ]}
          />
          <CompareRow
            label="Ціни"
            cells={[
              <span key="l" className="font-semibold">{formatPrice(listing.currentPrice, listing.currency)}</span>,
              ...candidates.map((c) => (
                <ul key={c.id} className="space-y-1 text-xs text-slate-600">
                  {c.offers.map((offer, index) => (
                    <li key={index}>
                      <span className="font-medium text-slate-800">{offer.chainName}</span> {formatPrice(offer.price, offer.currency)}
                      <div className="text-slate-500">
                        <Highlight text={offer.name} other={listing.name} />
                      </div>
                    </li>
                  ))}
                </ul>
              )),
            ]}
          />
          <CompareRow
            label="Рішення"
            cells={[
              <MatchingAction key="l" action={{ kind: 'reject', listingId: listing.id }} label="Жоден не підходить" variant="secondary" />,
              ...candidates.map((c) => (
                <MatchingAction key={c.id} action={{ kind: 'accept', candidateId: c.id }} label="✓ Той самий товар" variant="success" />
              )),
            ]}
          />
        </tbody>
      </table>
    </article>
  );
}

import Link from 'next/link';
import {
  getMatchingStatus,
  getReviewQueue,
} from '@/api/generated/matching/matching';
import type { ReviewItemDto } from '@/api/generated/model';
import { AutoRefresh } from '@/components/AutoRefresh';
import { MatchingAction } from '@/components/MatchingAction';
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
            автоматично після кожного парсингу.
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

function ReviewCard({ item }: { item: ReviewItemDto }) {
  const { listing } = item;
  return (
    <article className="rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-100 p-4">
        {listing.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- зображення з сайту мережі
          <img src={listing.imageUrl} alt="" className="h-14 w-14 rounded object-contain" loading="lazy" />
        ) : (
          <div className="h-14 w-14 rounded bg-slate-100" />
        )}
        <div className="min-w-64 flex-1">
          <div className="text-xs text-slate-500">
            {listing.chainName}
            {listing.brand && ` · ${listing.brand}`}
            {listing.quantityLabel && ` · ${listing.quantityLabel}`}
          </div>
          <Link href={`/admin/listings/${listing.id}`} className="font-medium text-blue-700 hover:underline">
            {listing.name}
          </Link>
          <div className="text-sm font-semibold">{formatPrice(listing.currentPrice, listing.currency)}</div>
        </div>
        <MatchingAction
          action={{ kind: 'reject', listingId: listing.id }}
          label="Жоден не підходить"
          variant="secondary"
        />
      </header>
      <ul className="divide-y divide-slate-100">
        {item.candidates.map((candidate) => (
          <li key={candidate.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="w-16 text-center">
              <div className="text-lg font-semibold">{formatScore(candidate.score)}</div>
              <div className="text-xs text-slate-400">схожість</div>
            </div>
            <div className="min-w-64 flex-1">
              <div className="text-xs text-slate-500">
                {[candidate.brand, candidate.variantLabel].filter(Boolean).join(' · ')}
              </div>
              <Link href={`/admin/products/${candidate.productId}`} className="font-medium text-blue-700 hover:underline">
                {candidate.productName}
              </Link>
              {candidate.barcodeMismatch && (
                <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">
                  різні штрихкоди
                </span>
              )}
              <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                {candidate.offers.map((offer, index) => (
                  <li key={index}>
                    <span className="font-medium">{offer.chainName}:</span> {offer.name} —{' '}
                    {formatPrice(offer.price, offer.currency)}
                  </li>
                ))}
              </ul>
            </div>
            <MatchingAction
              action={{ kind: 'accept', candidateId: candidate.id }}
              label="Це той самий товар"
              variant="success"
            />
          </li>
        ))}
      </ul>
    </article>
  );
}

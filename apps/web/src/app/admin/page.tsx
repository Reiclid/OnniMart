import Link from 'next/link';
import { getMatchingStatus } from '@/api/generated/matching/matching';
import {
  getChains,
  getScrapeRuns,
  getStats,
} from '@/api/generated/monitoring/monitoring';
import { AutoRefresh } from '@/components/AutoRefresh';
import { StatusBadge } from '@/components/StatusBadge';
import { TriggerButton } from '@/components/TriggerButton';
import {
  formatDateTime,
  formatDuration,
  formatNumber,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [{ data: stats }, { data: chains }, { data: runs }, { data: matching }] =
    await Promise.all([
      getStats(),
      // Реєстр містить сотні кандидатів — на огляді лише мережі з парсером
      getChains({ status: ['ACTIVE', 'PAUSED'] }),
      getScrapeRuns({ limit: 15 }),
      getMatchingStatus(),
    ]);
  const active = runs.some(
    (run) => run.status === 'QUEUED' || run.status === 'RUNNING',
  );

  const cards = [
    { label: 'Мережі', value: `${stats.enabledChains} / ${stats.chains}`, hint: 'увімкнено / усього' },
    { label: 'Картки товарів', value: formatNumber(stats.listings) },
    { label: 'Зі штрихкодом', value: formatNumber(stats.listingsWithBarcode) },
    { label: 'Товарів у каталозі', value: formatNumber(matching.products), href: '/admin/products?all=true' },
    {
      label: 'Порівнюються у 2+ мережах',
      value: formatNumber(matching.multiChainVariants),
      hint: 'фасувань',
      href: '/admin/products',
    },
    { label: 'На модерації', value: formatNumber(matching.inReview), href: '/admin/matching' },
    { label: 'З акцією', value: formatNumber(stats.promoListings) },
    { label: 'Записи історії цін', value: formatNumber(stats.priceSnapshots) },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Огляд</h1>
        <AutoRefresh active={active} />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => {
          const body = (
            <>
              <div className="text-xs text-slate-500">{card.label}</div>
              <div className="mt-1 text-2xl font-semibold">{card.value}</div>
              {card.hint && <div className="text-xs text-slate-400">{card.hint}</div>}
            </>
          );
          const className = 'rounded-lg border border-slate-200 bg-white p-4';
          return card.href ? (
            <Link key={card.label} href={card.href} className={`${className} hover:border-blue-300`}>
              {body}
            </Link>
          ) : (
            <div key={card.label} className={className}>
              {body}
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Мережі</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Мережа</th>
                <th className="px-4 py-2 text-right">Товарів</th>
                <th className="px-4 py-2 text-right">Акцій</th>
                <th className="px-4 py-2">Останній запуск</th>
                <th className="px-4 py-2 text-right">Парсинг</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chains.map((chain) => (
                <tr key={chain.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                        {chain.countryCode}
                      </span>
                      {chain.name}
                    </div>
                    <a href={chain.website} className="text-xs text-slate-500 hover:underline">
                      {chain.website.replace('https://', '')}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/listings?chain=${chain.slug}`} className="text-blue-700 hover:underline">
                      {formatNumber(chain.listingsCount)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/listings?chain=${chain.slug}&promo=true`} className="text-blue-700 hover:underline">
                      {formatNumber(chain.promoCount)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {chain.lastRun ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={chain.lastRun.status} />
                        <span className="text-xs text-slate-500">
                          {formatDateTime(chain.lastRun.startedAt)} · {chain.lastRun.itemsSeen} тов.
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">ще не запускався</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {chain.scrapeEnabled ? (
                      <TriggerButton store={chain.slug} />
                    ) : (
                      <div className="text-right text-xs text-slate-400">вимкнено</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Останні запуски парсера</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-slate-500">
            Запусків ще не було — натисніть «Запустити» біля мережі.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Мережа</th>
                  <th className="px-4 py-2">Статус</th>
                  <th className="px-4 py-2">Початок</th>
                  <th className="px-4 py-2">Тривалість</th>
                  <th className="px-4 py-2 text-right">Сторінок</th>
                  <th className="px-4 py-2 text-right">Товарів</th>
                  <th className="px-4 py-2 text-right">Змінено</th>
                  <th className="px-4 py-2">Помилки</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="px-4 py-2 font-medium">{run.chainName}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-2 text-slate-600">{formatDateTime(run.startedAt)}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {formatDuration(run.startedAt, run.finishedAt)}
                    </td>
                    <td className="px-4 py-2 text-right">{run.pagesFetched}</td>
                    <td className="px-4 py-2 text-right">{run.itemsSeen}</td>
                    <td className="px-4 py-2 text-right">{run.itemsChanged}</td>
                    <td className="max-w-xs truncate px-4 py-2 text-xs text-red-700" title={run.error ?? ''}>
                      {run.error ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

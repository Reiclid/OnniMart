import type { ReactNode } from 'react';
import Link from 'next/link';
import { ApiError } from '@/api/custom-fetch';
import { notFound } from 'next/navigation';
import { getListing } from '@/api/generated/monitoring/monitoring';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate, formatDateTime, formatPrice } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ListingPage(props: PageProps<'/listings/[id]'>) {
  const { id } = await props.params;
  const response = await getListing(id).catch((error: Error) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const item = response.data;

  const facts: [string, ReactNode][] = [
    ['Мережа', item.chainName],
    ['Ціна', formatPrice(item.currentPrice, item.currency)],
    ['Стара ціна', formatPrice(item.regularPrice, item.currency)],
    [
      'За одиницю',
      item.unitPrice !== null
        ? `${formatPrice(item.unitPrice, item.currency)}/${item.unitLabel}`
        : '—',
    ],
    ['Фасування', item.quantityLabel ?? '—'],
    ['Бренд', item.brand ?? '—'],
    ['Категорія мережі', item.category ?? '—'],
    ['Наявність', item.inStock ? 'є в наявності' : 'немає'],
    ['Штрихкоди', item.barcodes.length ? item.barcodes.join(', ') : '—'],
    ['ID у мережі', item.externalId],
    ['Уперше побачено', formatDateTime(item.firstSeenAt)],
    ['Востаннє побачено', formatDateTime(item.lastSeenAt)],
  ];

  return (
    <div className="space-y-6">
      <Link href="/listings" className="text-sm text-blue-700 hover:underline">
        ← До списку
      </Link>

      <div className="flex flex-wrap gap-6 rounded-lg border border-slate-200 bg-white p-6">
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- зображення з доменів мереж
          <img src={item.imageUrl} alt={item.name} className="h-40 w-40 rounded object-contain" />
        )}
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-bold">{item.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <StatusBadge status={item.matchStatus} />
              {item.isOnPromo && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                  Акція
                </span>
              )}
              {item.url && (
                <a href={item.url} className="text-blue-700 hover:underline">
                  Відкрити на сайті мережі ↗
                </a>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-slate-100 py-1">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {item.variant && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              Зіставлено з каталогом:
              <Link href={`/products/${item.variant.productId}`} className="font-semibold text-blue-700 hover:underline">
                {item.variant.productName}, {item.variant.label}
              </Link>
              {item.matchMethod && <StatusBadge status={item.matchMethod} />}
            </p>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Цей товар в інших мережах</h2>
        {item.otherOffers.length === 0 ? (
          <p className="text-sm text-slate-500">
            {item.variant
              ? 'Поки що цей товар знайдено лише в цій мережі.'
              : 'Картку ще не зіставлено з каталогом — вона на модерації або чекає наступного запуску зіставлення.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Мережа</th>
                  <th className="px-4 py-2">Назва в мережі</th>
                  <th className="px-4 py-2 text-right">Ціна</th>
                  <th className="px-4 py-2 text-right">За одиницю</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[item, ...item.otherOffers].map((other) => (
                  <tr key={other.id} className={other.id === item.id ? 'bg-blue-50' : ''}>
                    <td className="px-4 py-2 font-medium">{other.chainName}</td>
                    <td className="px-4 py-2">
                      <Link href={`/listings/${other.id}`} className="text-blue-700 hover:underline">
                        {other.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <span className={other.isOnPromo ? 'font-semibold text-red-700' : 'font-semibold'}>
                        {formatPrice(other.currentPrice, other.currency)}
                      </span>
                      {other.regularPrice !== null && (
                        <span className="ml-2 text-xs text-slate-400 line-through">
                          {formatPrice(other.regularPrice, other.currency)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap text-slate-600">
                      {other.unitPrice !== null
                        ? `${formatPrice(other.unitPrice, other.currency)}/${other.unitLabel}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Історія цін</h2>
        <p className="text-sm text-slate-500">
          Новий запис з’являється лише тоді, коли змінюється ціна, акція або наявність.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Дата</th>
                <th className="px-4 py-2 text-right">Ціна</th>
                <th className="px-4 py-2 text-right">Стара ціна</th>
                <th className="px-4 py-2 text-right">За одиницю</th>
                <th className="px-4 py-2">Акція</th>
                <th className="px-4 py-2">Діє до</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {item.history.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td className="px-4 py-2">{formatDateTime(snapshot.capturedAt)}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatPrice(snapshot.price, item.currency)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500">
                    {formatPrice(snapshot.regularPrice, item.currency)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500">
                    {snapshot.unitPrice !== null
                      ? `${formatPrice(snapshot.unitPrice, item.currency)}/${item.unitLabel}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2">{snapshot.promoLabel ?? snapshot.promoType ?? '—'}</td>
                  <td className="px-4 py-2">{formatDate(snapshot.promoEndsAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">Сирі дані парсера</summary>
        <pre className="mt-3 overflow-x-auto text-xs">
          {JSON.stringify(item.rawData, null, 2)}
        </pre>
      </details>
    </div>
  );
}

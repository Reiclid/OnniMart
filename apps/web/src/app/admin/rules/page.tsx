import Link from 'next/link';
import { getMatchingRuleHits, getMatchingRules } from '@/api/generated/matching/matching';
import type { GetMatchingRuleHitsDecision, RuleHitPageDto } from '@/api/generated/model';
import { RuleToggle } from '@/components/RuleToggle';
import { formatDateTime, formatNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const DECISIONS: Record<string, { label: string; className: string }> = {
  barcode: { label: 'штрихкод', className: 'bg-blue-50 text-blue-700' },
  fuzzy: { label: 'за назвою', className: 'bg-green-50 text-green-700' },
  review: { label: 'модератору', className: 'bg-amber-50 text-amber-700' },
  variant: {
    label: 'нове фасування',
    className: 'bg-violet-50 text-violet-700',
  },
  product: { label: 'новий товар', className: 'bg-slate-100 text-slate-600' },
};

function DecisionBadge({ decision, count }: { decision: string; count?: number }) {
  const d = DECISIONS[decision] ?? {
    label: decision,
    className: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${d.className}`}>
      {d.label}
      {count !== undefined && <span className="ml-1 tabular-nums">{formatNumber(count)}</span>}
    </span>
  );
}

/**
 * Правила зіставлення: які увімкнені, на скільки й на які картки кожне вплинуло,
 * і перемикачі. Вимкнене правило діє з наступного пакета воркера.
 */
export default async function RulesPage(props: PageProps<'/admin/rules'>) {
  const searchParams = await props.searchParams;
  const { data } = await getMatchingRules();
  const selected = data.items.find((r) => r.key === first(searchParams.rule));
  const decision = first(searchParams.decision) as GetMatchingRuleHitsDecision | undefined;
  const page = Number(first(searchParams.page) ?? 1) || 1;
  // 404 (невідоме правило) customFetch кидає як ApiError, тож тут лише сторінка карток
  const hits = selected
    ? ((
        await getMatchingRuleHits(selected.key, {
          decision,
          page,
          pageSize: PAGE_SIZE,
        })
      ).data as RuleHitPageDto)
    : null;
  const href = (patch: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({
      rule: selected?.key,
      decision,
      page: 1,
      ...patch,
    })) {
      if (v !== undefined) params.set(k, String(v));
    }
    return `/admin/rules?${params}#hits`;
  };
  const lastPage = hits ? Math.max(Math.ceil(hits.total / hits.pageSize), 1) : 1;
  const off = data.items.filter((r) => !r.enabled).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Правила зіставлення</h1>
        <p className="text-sm text-slate-500">
          Кожне правило змінює рішення воркера про нову картку: відкидає кандидата, знижує оцінку або вибирає спосіб
          зіставлення. Лічильник — картки, на рішення про які правило вплинуло за {data.days} днів.{' '}
          {data.lastBatchAt
            ? `Останній пакет: ${formatDateTime(data.lastBatchAt)}.`
            : 'Пакетів зіставлення ще не було.'}{' '}
          Перемикач діє з наступного пакета; уже зіставлені картки не змінюються. Вплив на точність перевіряйте{' '}
          <code>bun run match:evaluate</code>.
        </p>
        {off > 0 && (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Вимкнено правил: {off}. Нові картки зіставляються без них.
          </p>
        )}
      </div>

      <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-3 py-2">Правило</th>
            <th className="px-2 text-right">За {data.days} дн.</th>
            <th className="px-2 text-right">Останній пакет</th>
            <th className="px-2">Рішення</th>
            <th className="px-3 text-right">Увімкнене</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((r) => (
            <tr
              key={r.key}
              className={`border-t border-slate-100 align-top ${r.enabled ? '' : 'bg-slate-50 text-slate-500'} ${
                r.key === selected?.key ? 'ring-2 ring-blue-200 ring-inset' : ''
              }`}
            >
              <td className="max-w-xl px-3 py-2">
                <Link href={`/admin/rules?rule=${r.key}#hits`} className="font-medium hover:underline">
                  {r.title}
                </Link>
                {!r.enabled && (
                  <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">вимкнене</span>
                )}
                <div className="text-xs text-slate-500">{r.description}</div>
                {r.updatedAt && <div className="text-xs text-slate-400">Змінено {formatDateTime(r.updatedAt)}</div>}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                <Link href={`/admin/rules?rule=${r.key}#hits`} className="text-blue-700 hover:underline">
                  {formatNumber(r.hits)}
                </Link>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(r.lastBatch)}</td>
              <td className="px-2 py-2">
                <span className="flex flex-wrap gap-1">
                  {r.byDecision.map((d) => (
                    <Link key={d.decision} href={`/admin/rules?rule=${r.key}&decision=${d.decision}#hits`}>
                      <DecisionBadge decision={d.decision} count={d.count} />
                    </Link>
                  ))}
                  {r.byDecision.length === 0 && <span className="text-xs text-slate-400">—</span>}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                <RuleToggle ruleKey={r.key} title={r.title} enabled={r.enabled} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && hits && (
        <section id="hits" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{selected.title}</h2>
            <span className="text-sm text-slate-500">· знайдено {formatNumber(hits.total)}</span>
            <span className="ml-auto flex flex-wrap gap-1 text-sm">
              <Link
                href={href({ decision: undefined })}
                className={`rounded-full border px-3 py-1 ${
                  !decision ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600'
                }`}
              >
                Усі
              </Link>
              {selected.byDecision.map((d) => (
                <Link
                  key={d.decision}
                  href={href({ decision: d.decision })}
                  className={`rounded-full border px-3 py-1 ${
                    decision === d.decision
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {DECISIONS[d.decision]?.label ?? d.decision}{' '}
                  <span className="text-slate-400">{formatNumber(d.count)}</span>
                </Link>
              ))}
            </span>
          </div>
          <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Картка</th>
                <th className="px-2">Мережа</th>
                <th className="px-2">Рішення</th>
                <th className="px-2">Товар зараз</th>
                <th className="px-3 text-right">Коли</th>
              </tr>
            </thead>
            <tbody>
              {hits.items.map((h, i) => (
                <tr key={`${h.listingId}-${i}`} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">
                    <Link href={`/admin/listings/${h.listingId}`} className="hover:underline">
                      {h.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-slate-600">{h.chain}</td>
                  <td className="px-2 py-2">
                    <DecisionBadge decision={h.decision} />
                  </td>
                  <td className="px-2 py-2">
                    {h.productId ? (
                      <Link href={`/admin/products/${h.productId}`} className="text-blue-700 hover:underline">
                        {h.product}
                      </Link>
                    ) : (
                      <span className="text-slate-400">не зіставлена</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-slate-500">{formatDateTime(h.at)}</td>
                </tr>
              ))}
              {hits.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    За {data.days} днів правило не вплинуло на жодну картку.
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
        </section>
      )}
    </div>
  );
}

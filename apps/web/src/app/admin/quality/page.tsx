import Link from 'next/link';
import type { ReactNode } from 'react';
import { getQualityReport } from '@/api/generated/quality/quality';
import type { QualityItemDto } from '@/api/generated/model';
import { BoxRows, LogLogScatter, RatioHistogram } from '@/components/QualityCharts';
import { formatDateTime, formatNumber } from '@/lib/format';
import { ratioLabel, shortNumber } from '@/lib/quality';

export const dynamic = 'force-dynamic';

const UNIT: Record<string, string> = { MASS: 'кг', VOLUME: 'л', COUNT: 'шт' };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * PRD-32 крок 2: графіки, вибрані дослідженням (docs/09-data-quality.md §6). Кожна червона
 * точка або рядок списку веде на картку чи товар, де помилку виправляють.
 */
export default async function QualityPage(props: PageProps<'/admin/quality'>) {
  const searchParams = await props.searchParams;
  const country = first(searchParams.country);
  const chain = first(searchParams.chain);
  const group = first(searchParams.group);
  const { data: report } = await getQualityReport({ country, chain, group });
  const chains = report.chains.filter((c) => !country || c.country === country);
  const scatterUnit = UNIT[report.scatter.group?.split('|')[2] ?? ''] ?? 'од.';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Якість даних</h1>
        <p className="text-sm text-slate-500">
          {formatNumber(report.analysed)} активних карток у наявності з ціною · {formatDateTime(report.generatedAt)}.
          Червоне — підозрілі значення: картки, ціни яких далеко від своєї групи (медіана й MAD, |z| &gt; 3,5) або за
          межами правил. Клік по точці чи рядку відкриває картку, де її відвʼязують або виправляють товар. Чому саме ці
          графіки — <code>docs/09-data-quality.md</code>.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <label className="flex flex-col gap-1">
          Країна
          <select name="country" defaultValue={country ?? ''} className="rounded border border-slate-300 px-2 py-1">
            <option value="">Усі</option>
            {[...new Set(report.chains.map((c) => c.country))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Мережа
          <select name="chain" defaultValue={chain ?? ''} className="rounded border border-slate-300 px-2 py-1">
            <option value="">Усі</option>
            {chains.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name} ({c.country})
              </option>
            ))}
          </select>
        </label>
        <button className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700">Показати</button>
        <span className="text-xs text-slate-500">
          Мережа звужує позначки й таблиці; групи для порівняння рахуються по всій країні.
        </span>
      </form>

      <Section
        n={1}
        title="Ціна за одиницю по групах"
        count={report.unitPrice.total}
        about="Категорія + країна + одиниця, логарифмічна шкала. Ловить ціни в копійках (×100), г ↔ кг, помилки фасування. Показано групи з найбільшою кількістю позначок."
      >
        <BoxRows rows={report.unitPrice.groups} unit="за од." />
        <Flagged
          items={report.unitPrice.flagged}
          total={report.unitPrice.total}
          value={(i) => `${shortNumber(i.value)} (медіана ${shortNumber(i.reference ?? 0)})`}
          valueTitle="Ціна за од."
        />
      </Section>

      <Section
        n={2}
        title="Розмір упаковки по мережах"
        count={report.packSize.total}
        about={`Логарифмічна шкала, межа ${report.packSize.limit} г / мл (червона пунктирна). Ловить «1 kg», прочитане як 1 г, і дозу «500 мг» замість фасування.`}
      >
        <BoxRows rows={report.packSize.chains} unit="г / мл" limit={report.packSize.limit} />
        <Flagged
          items={report.packSize.flagged}
          total={report.packSize.total}
          value={(i) => `${shortNumber(i.value)} ${i.group ?? ''}`}
          valueTitle="Фасування"
        />
      </Section>

      <Section
        n={3}
        title="Ціна в мережі ÷ ціна того самого фасування в інших мережах"
        count={report.variantRatio.total}
        about={`Межа ${ratioLabel(report.variantRatio.limit)} в обидва боки (червоні стовпці). Ловить інше фасування, приєднане до товару, і помилку ціни однієї мережі. Порівнюються ${formatNumber(report.variantRatio.compared)} карток — ті, чиє фасування продають ≥ 2 мережі країни.`}
      >
        <RatioHistogram bins={report.variantRatio.bins} limit={report.variantRatio.limit} />
        <Flagged
          items={report.variantRatio.flagged}
          total={report.variantRatio.total}
          value={(i) => `${ratioLabel(i.value)} (інші: ${shortNumber(i.reference ?? 0)})`}
          valueTitle="Відношення"
        />
      </Section>

      <Section
        n={4}
        title="Знижки по мережах"
        count={report.discount.total}
        about={`Знижка у % від закресленої ціни, лише картки з акцією. Позначено закреслену ціну ≤ поточної і знижки понад ${report.discount.limit} %.`}
      >
        <BoxRows rows={report.discount.chains} unit="%" limit={report.discount.limit} linear />
        <Flagged
          items={report.discount.chains.flatMap((c) => c.flagged)}
          total={report.discount.total}
          value={(i) => `${shortNumber(i.value)} % (було ${shortNumber(i.reference ?? 0)})`}
          valueTitle="Знижка"
        />
      </Section>

      <Section
        n={5}
        title="Ціна за одиницю від розміру упаковки (log–log)"
        count={report.scatter.groups.find((g) => g.key === report.scatter.group)?.outliers ?? 0}
        about="Більша упаковка зазвичай дешевша за кг: точки лежать уздовж прямої (Theil–Sen, пунктир). Червоне — далеко від прямої своєї групи: мультипак з ціною за штуку, г ↔ кг. Групи впорядковано за кількістю позначок."
      >
        <form className="flex flex-wrap items-end gap-2 text-sm">
          {country && <input type="hidden" name="country" value={country} />}
          {chain && <input type="hidden" name="chain" value={chain} />}
          <select
            name="group"
            defaultValue={report.scatter.group ?? ''}
            className="rounded border border-slate-300 px-2 py-1"
          >
            {report.scatter.groups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label} — {g.outliers}
              </option>
            ))}
          </select>
          <button className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">
            Показати групу
          </button>
        </form>
        <LogLogScatter points={report.scatter.points} fit={report.scatter.fit} unit={scatterUnit} />
      </Section>

      <Section
        n={6}
        title="Картки без ознаки, по мережах"
        about="Частка активних карток без фасування, ціни за одиницю, категорії або без фасування в каталозі. Різкий ріст після запуску парсера — сайт мережі змінився."
      >
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">Мережа</th>
              <th className="text-right">Карток</th>
              <th className="text-right">Без фасування</th>
              <th className="text-right">Без ціни за од.</th>
              <th className="text-right">Без категорії</th>
              <th className="text-right">Не в каталозі</th>
            </tr>
          </thead>
          <tbody>
            {report.completeness.map((c) => (
              <tr key={c.chain} className="border-t border-slate-100">
                <td className="py-1">
                  <Link href={`/admin/listings?chain=${c.chain}`} className="text-blue-700 hover:underline">
                    {c.chain}
                  </Link>
                </td>
                <td className="text-right tabular-nums">{formatNumber(c.listings)}</td>
                <Pct value={c.noQuantity} />
                <Pct value={c.noUnitPrice} />
                <Pct value={c.noCategory} />
                <Pct value={c.unmatched} />
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        n={7}
        title="Стрибки ціни більше ніж утричі"
        count={report.jumps.length}
        about="Між двома сусідніми знімками картки. Разова помилка парсера або зміна одиниці на сайті мережі; справжня ціна так не стрибає."
      >
        <table className="w-full text-sm">
          <tbody>
            {report.jumps.map((j) => (
              <tr key={`${j.listingId}${j.at}`} className="border-t border-slate-100">
                <td className="py-1 text-slate-500">{j.chain}</td>
                <td>
                  <Link href={`/admin/listings/${j.listingId}`} className="text-blue-700 hover:underline">
                    {j.name}
                  </Link>
                </td>
                <td className="text-right tabular-nums">
                  {shortNumber(j.prev)} → <b>{shortNumber(j.price)}</b>
                </td>
                <td className="pl-3 text-right text-slate-500">{formatDateTime(j.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.jumps.length === 0 && <p className="text-sm text-slate-500">Немає.</p>}
      </Section>

      <Section
        n={8}
        title="Фасування з кількома картками однієї мережі"
        count={report.duplicates.length}
        about="Мережа не продає той самий товар двічі: дві її активні картки в одному фасуванні — хибне злиття (різні розміри, смаки) або дубль картки на сайті. Відвʼяжіть зайву на сторінці товару."
      >
        <ul className="space-y-2 text-sm">
          {report.duplicates.map((d) => (
            <li key={`${d.variantId}${d.chain}`} className="border-t border-slate-100 pt-2">
              <Link href={`/admin/products/${d.productId}`} className="font-medium text-blue-700 hover:underline">
                {d.product}
              </Link>{' '}
              <span className="text-slate-500">
                [{d.chain}] ×{d.listings.length}
              </span>
              <ul className="ml-4 list-disc text-slate-700">
                {d.listings.map((l) => (
                  <li key={l.id}>
                    <Link href={`/admin/listings/${l.id}`} className="hover:underline">
                      {l.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {report.duplicates.length === 0 && <p className="text-sm text-slate-500">Немає.</p>}
      </Section>

      <Section
        n={9}
        title="Свіжість даних по мережах"
        count={report.freshness.filter((c) => c.problems.length).length}
        about="Коли мережу обходили й скільки її карток давно не бачили на сайті. Картки, старші за 14 днів, не беруть участі в «найдешевше» (якщо в товару є свіжіші) і сповіщеннях. У мереж з Open Prices дата картки — дата чека."
      >
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1 font-normal">Мережа</th>
              <th className="text-right font-normal">Активних</th>
              <th className="text-right font-normal">Старші 2 / 7 / 14 дн.</th>
              <th className="pl-3 text-right font-normal">Повний обхід</th>
              <th className="pl-3 font-normal">Зауваження</th>
            </tr>
          </thead>
          <tbody>
            {report.freshness.map((c) => (
              <tr key={c.chain} className="border-t border-slate-100 align-top">
                <td className="py-1">
                  {c.name} <span className="text-slate-500">({c.country})</span>
                </td>
                <td className="text-right tabular-nums">{formatNumber(c.active)}</td>
                <td className="text-right tabular-nums">
                  {formatNumber(c.older2d)} / {formatNumber(c.older7d)} / {formatNumber(c.stale)}
                </td>
                <td className="pl-3 text-right text-slate-500">
                  {c.lastFullAt ? formatDateTime(c.lastFullAt) : 'ніколи'}
                </td>
                <td className="pl-3 text-red-600">{c.problems.join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Section({
  n,
  title,
  count,
  about,
  children,
}: {
  n: number;
  title: string;
  count?: number;
  about: string;
  children: ReactNode;
}) {
  return (
    <section id={`chart-${n}`} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold">
          {n}. {title}
          {count !== undefined && (
            <span className={`ml-2 text-sm font-normal ${count ? 'text-red-600' : 'text-slate-400'}`}>
              позначено: {formatNumber(count)}
            </span>
          )}
        </h2>
        <p className="text-sm text-slate-500">{about}</p>
      </div>
      {children}
    </section>
  );
}

/** Список позначених карток під графіком: назва → картка, «товар» → сторінка товару */
function Flagged({
  items,
  total,
  value,
  valueTitle,
}: {
  items: QualityItemDto[];
  total: number;
  value: (item: QualityItemDto) => string;
  valueTitle: string;
}) {
  if (items.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-slate-600">
        Позначені картки ({items.length < total ? `перші ${items.length} з ${formatNumber(total)}` : total})
      </summary>
      <table className="mt-2 w-full">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-1">Мережа</th>
            <th>Картка</th>
            <th className="text-right">{valueTitle}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.listingId} className="border-t border-slate-100">
              <td className="py-1 text-slate-500">{i.chain}</td>
              <td>
                <Link href={`/admin/listings/${i.listingId}`} className="text-blue-700 hover:underline">
                  {i.name}
                </Link>
                {i.group && i.group.length > 2 && <span className="ml-2 text-xs text-slate-400">{i.group}</span>}
              </td>
              <td className="text-right tabular-nums">{value(i)}</td>
              <td className="pl-3 text-right">
                {i.productId && (
                  <Link href={`/admin/products/${i.productId}`} className="text-slate-500 hover:underline">
                    товар
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Pct({ value }: { value: number }) {
  return <td className={`text-right tabular-nums ${value >= 30 ? 'font-semibold text-red-600' : ''}`}>{value} %</td>;
}

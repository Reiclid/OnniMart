'use client';

import { useState } from 'react';
import type { PriceSeriesDto } from '@/api/generated/model';
import { formatMoney } from '@/lib/format';

const W = 600;
const H = 180;
const PAD = { top: 14, right: 10, bottom: 24, left: 10 };

/**
 * Кольори мереж — категоріальна палітра в фіксованому порядку (перевірена на розрізнення при
 * дальтонізмі, dataviz validate_palette). Три з них мають контраст < 3:1 до білого, тому кожна
 * мережа має ще й свій штрих і підпис у легенді: лінії, що збігаються, видно обидві.
 */
const SERIES = [
  { color: '#2a78d6', dash: undefined },
  { color: '#eb6834', dash: '7 5' },
  { color: '#1baf7a', dash: '2 4' },
  { color: '#eda100', dash: '10 4 2 4' },
  { color: '#e87ba4', dash: '4 3' },
  { color: '#008300', dash: '12 5' },
  { color: '#6250d6', dash: '1 3' },
  { color: '#e34948', dash: '6 3 1 3' },
];

type Pt = { x: number; y: number };

/**
 * Плавна крива через точки (монотонний кубічний сплайн Fritsch–Carlson): не вилітає вище
 * чи нижче сусідніх цін, тож між двома цінами не малює неіснуючих піків
 */
function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0].x},${pts[0].y}` : '';
  const n = pts.length;
  const m = pts.slice(0, -1).map((p, i) => (pts[i + 1].y - p.y) / (pts[i + 1].x - p.x || 1));
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      t[i] = (3 / Math.sqrt(s)) * a * m[i];
      t[i + 1] = (3 / Math.sqrt(s)) * b * m[i];
    }
  }
  const f = (v: number) => v.toFixed(1);
  return pts.reduce((d, p, i) => {
    if (i === 0) return `M${f(p.x)},${f(p.y)}`;
    const q = pts[i - 1];
    const dx = (p.x - q.x) / 3;
    return `${d}C${f(q.x + dx)},${f(q.y + t[i - 1] * dx)} ${f(p.x - dx)},${f(p.y - t[i] * dx)} ${f(p.x)},${f(p.y)}`;
  }, '');
}

/**
 * PRD-02 графік ціни по мережах (одна валюта). Точки — справжні спостереження: кожна зміна ціни
 * й останній огляд картки (огляди без зміни ціни не зберігаються). Підказка — на найближчій точці.
 */
export function PriceChart({
  series,
  highlight,
  locale,
  label,
}: {
  series: PriceSeriesDto[];
  /** listingId найдешевшої зараз мережі */
  highlight: string | undefined;
  locale: string;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Колір іде за мережею, а не за рангом: порядок за назвою не залежить від цін
  const ordered = [...series].sort((a, b) => a.chainName.localeCompare(b.chainName));
  const style = new Map(ordered.map((s, i) => [s.listingId, SERIES[i % SERIES.length]]));
  const all = series.flatMap((s) => s.points.map((p) => ({ t: Date.parse(p.at), price: p.price, observed: p.observed })));
  if (!all.length) return null;
  const t0 = Math.min(...all.map((p) => p.t));
  const t1 = Math.max(...all.map((p) => p.t));
  const lo = Math.min(...all.map((p) => p.price));
  const hi = Math.max(...all.map((p) => p.price));
  // Рівна ціна — лінія посередині, а не на краю
  const span = hi - lo || hi * 0.1 || 1;
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right);
  const y = (p: number) => PAD.top + (1 - (p - lo + (hi === lo ? span / 2 : 0)) / span) * (H - PAD.top - PAD.bottom);
  // Моменти спостережень — до них прилипає підказка
  const moments = [...new Set(all.filter((p) => p.observed).map((p) => p.t))].sort((a, b) => a - b);
  const priceAt = (s: PriceSeriesDto, t: number) => s.points.filter((p) => Date.parse(p.at) <= t).at(-1)?.price ?? null;
  const currency = series[0].currency;
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  // Суцільна лінія знизу, штрихові зверху — на спільній ціні видно обидві
  const drawOrder = [...ordered].sort((a, b) => Number(!!style.get(a.listingId)!.dash) - Number(!!style.get(b.listingId)!.dash));
  const hx = hover === null ? 0 : x(hover);

  return (
    <figure className="space-y-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-44 w-full touch-none"
          role="img"
          aria-label={label}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - box.left) / box.width) * W;
            const t = t0 + ((px - PAD.left) / (W - PAD.left - PAD.right)) * (t1 - t0);
            setHover(moments.reduce((best, m) => (Math.abs(m - t) < Math.abs(best - t) ? m : best), moments[0] ?? t0));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {[lo, hi].map((v) => (
            <line key={v} x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
          ))}
          {hover !== null && <line x1={hx} x2={hx} y1={PAD.top} y2={H - PAD.bottom} className="stroke-line-strong" strokeWidth={1} />}
          {drawOrder.map((s) => {
            const { color, dash } = style.get(s.listingId)!;
            return (
              <g key={s.listingId}>
                <path
                  d={smoothPath(s.points.map((p) => ({ x: x(Date.parse(p.at)), y: y(p.price) })))}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                />
                {s.points
                  .filter((p) => p.observed)
                  .map((p) => {
                    const t = Date.parse(p.at);
                    return (
                      <circle
                        key={p.at}
                        cx={x(t)}
                        cy={y(p.price)}
                        r={t === hover ? 5 : 4}
                        fill={color}
                        // Кільце кольору фону відділяє точки, що лягли одна на одну
                        className="stroke-surface"
                        strokeWidth={2}
                      />
                    );
                  })}
              </g>
            );
          })}
          <text x={PAD.left} y={H - 5} className="fill-fg-muted text-[11px]">{date.format(t0)}</text>
          <text x={W - PAD.right} y={H - 5} textAnchor="end" className="fill-fg-muted text-[11px]">{date.format(t1)}</text>
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 w-max max-w-64 rounded-md border border-line bg-surface px-3 py-2 text-caption shadow-floating tabular-nums"
            // У правій половині — ліворуч від лінії: підказка не впирається в край і не звужується
            style={{ left: `${(hx / W) * 100}%`, translate: hx > W / 2 ? 'calc(-100% - 8px) 0' : '8px 0' }}
          >
            <div className="mb-1 text-fg-muted">{date.format(hover)}</div>
            {ordered.map((s) => {
              const price = priceAt(s, hover);
              const { color } = style.get(s.listingId)!;
              return (
                price !== null && (
                  <div key={s.listingId} className={`flex items-center gap-2 whitespace-nowrap ${s.listingId === highlight ? 'font-semibold' : ''}`}>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                    <span className="flex-1">{s.chainName}</span>
                    <span>{formatMoney(price, s.currency)}</span>
                  </div>
                )
              );
            })}
          </div>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted tabular-nums">
        <span>
          {formatMoney(lo, currency)} – {formatMoney(hi, currency)}
        </span>
        {ordered.map((s) => {
          const { color, dash } = style.get(s.listingId)!;
          return (
            <span key={s.listingId} className={`flex items-center gap-1.5 ${s.listingId === highlight ? 'font-semibold text-fg' : ''}`}>
              <svg width="20" height="6" aria-hidden>
                <line x1="1" x2="19" y1="3" y2="3" stroke={color} strokeWidth={2} strokeDasharray={dash} strokeLinecap="round" />
              </svg>
              {s.chainName}
            </span>
          );
        })}
      </figcaption>
    </figure>
  );
}

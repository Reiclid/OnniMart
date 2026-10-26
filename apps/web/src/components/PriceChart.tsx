'use client';

import { useState } from 'react';
import type { PriceSeriesDto } from '@/api/generated/model';
import { formatMoney } from '@/lib/format';

const W = 600;
const H = 160;
const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

/**
 * PRD-02 графік ціни по мережах (одна валюта). Історія — лише зміни, тож лінії ступінчасті.
 * Найдешевша мережа — кольором бренду, решта — приглушені; хто є хто — легенда й підказка.
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
  const points = series.flatMap((s) => s.points.map((p) => ({ t: Date.parse(p.at), price: p.price })));
  if (!points.length) return null;
  const t0 = Math.min(...points.map((p) => p.t));
  const t1 = Math.max(...points.map((p) => p.t));
  const lo = Math.min(...points.map((p) => p.price));
  const hi = Math.max(...points.map((p) => p.price));
  // Рівна ціна — лінія посередині, а не на краю
  const span = hi - lo || hi * 0.1 || 1;
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right);
  const y = (p: number) => PAD.top + (1 - (p - lo + (hi === lo ? span / 2 : 0)) / span) * (H - PAD.top - PAD.bottom);
  const path = (s: PriceSeriesDto) =>
    s.points
      .map((p, i) => {
        const px = x(Date.parse(p.at)).toFixed(1);
        const py = y(p.price).toFixed(1);
        return i === 0 ? `M${px},${py}` : `H${px}V${py}`;
      })
      .join('');
  // Ціна кожної мережі в момент t: останній знімок не пізніше t
  const priceAt = (s: PriceSeriesDto, t: number) => s.points.filter((p) => Date.parse(p.at) <= t).at(-1)?.price ?? null;
  const currency = series[0].currency;
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const ordered = [...series].sort((a, b) => Number(a.listingId === highlight) - Number(b.listingId === highlight));

  return (
    <figure className="space-y-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 w-full touch-none"
          role="img"
          aria-label={label}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - box.left) / box.width) * W;
            setHover(t0 + Math.min(Math.max((px - PAD.left) / (W - PAD.left - PAD.right), 0), 1) * (t1 - t0));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {[lo, hi].map((v) => (
            <line key={v} x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
          ))}
          {ordered.map((s) => (
            <path
              key={s.listingId}
              d={path(s)}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              className={s.listingId === highlight ? 'stroke-brand' : 'stroke-line-strong'}
            />
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-icon-muted" strokeWidth={1} />}
          <text x={PAD.left} y={H - 4} className="fill-fg-muted text-[11px]">{date.format(t0)}</text>
          <text x={W - PAD.right} y={H - 4} textAnchor="end" className="fill-fg-muted text-[11px]">{date.format(t1)}</text>
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 rounded-md border border-line bg-surface px-3 py-2 text-caption shadow-floating tabular-nums"
            style={{ left: `${(x(hover) / W) * 100}%`, translate: x(hover) > W / 2 ? '-100% 0' : '0 0' }}
          >
            <div className="text-fg-muted">{date.format(hover)}</div>
            {series.map((s) => {
              const price = priceAt(s, hover);
              return (
                price !== null && (
                  <div key={s.listingId} className={s.listingId === highlight ? 'font-semibold' : ''}>
                    {s.chainName}: {formatMoney(price, s.currency)}
                  </div>
                )
              );
            })}
          </div>
        )}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-fg-muted tabular-nums">
        <span>
          {formatMoney(lo, currency)} – {formatMoney(hi, currency)}
        </span>
        {series.length > 1 &&
          series.map((s) => (
            <span key={s.listingId} className="flex items-center gap-1.5">
              <span className={`h-0.5 w-3 rounded-full ${s.listingId === highlight ? 'bg-brand' : 'bg-line-strong'}`} aria-hidden />
              {s.chainName}
            </span>
          ))}
      </figcaption>
    </figure>
  );
}

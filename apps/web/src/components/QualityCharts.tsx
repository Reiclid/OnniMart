import type { QualityBinDto, QualityBoxDto, ScatterPointDto, FitDto } from '@/api/generated/model';
import { linearTicks, logTicks, ratioLabel, shortNumber } from '@/lib/quality';

/**
 * PRD-32 графіки якості даних — власні SVG (без бібліотеки, як PriceChart).
 * Сіре — норма групи, червоне — позначені точки; клік по червоній точці відкриває картку.
 */
const FLAG = '#dc2626';
const BOX = '#cbd5e1';
const LINE = '#475569';
const GRID = '#e2e8f0';
const TEXT = '#64748b';

const listingHref = (id: string) => `/admin/listings/${id}`;

/** Логарифмічна шкала: значення → x у [left, right] */
function logScale(min: number, max: number, left: number, right: number) {
  const lo = Math.log10(min);
  const span = Math.log10(max) - lo || 1;
  return (v: number) => left + ((Math.log10(Math.max(v, min)) - lo) / span) * (right - left);
}

function linearScale(min: number, max: number, left: number, right: number) {
  const span = max - min || 1;
  return (v: number) => left + ((v - min) / span) * (right - left);
}

/**
 * Рядки «ящик з вусами» (лог. шкала, якщо не linear): вуса — 5-й і 95-й перцентилі, ящик — квартилі,
 * риска — медіана; червоні точки — позначені картки рядка. limit — вертикальна межа.
 */
export function BoxRows({
  rows,
  unit,
  limit,
  linear,
}: {
  rows: QualityBoxDto[];
  unit: string;
  limit?: number;
  /** Звичайна шкала (знижки: бувають 0 і від'ємні) */
  linear?: boolean;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">Немає даних.</p>;
  const W = 900;
  const LABEL = 230;
  const ROW = 26;
  const TOP = 24;
  const H = TOP + rows.length * ROW + 6;
  const all = rows.flatMap((r) => [r.p5, r.p95, ...r.flagged.map((f) => f.value)]);
  if (limit) all.push(limit);
  const values = linear ? all : all.filter((v) => v > 0);
  const min = linear ? Math.min(0, ...values) : Math.min(...values) / 1.3;
  const max = linear ? Math.max(...values) : Math.max(...values) * 1.3;
  const x = linear ? linearScale(min, max, LABEL + 8, W - 12) : logScale(min, max, LABEL + 8, W - 12);
  const ticks = linear ? linearTicks(min, max) : logTicks(min, max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Розподіл, ${unit}, логарифмічна шкала`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={TOP - 4} y2={H - 4} stroke={GRID} />
          <text x={x(t)} y={TOP - 10} fontSize={11} fill={TEXT} textAnchor="middle">
            {shortNumber(t)}
          </text>
        </g>
      ))}
      {limit !== undefined && (
        <line x1={x(limit)} x2={x(limit)} y1={TOP - 4} y2={H - 4} stroke={FLAG} strokeDasharray="4 3" />
      )}
      {rows.map((r, i) => {
        const y = TOP + i * ROW + ROW / 2;
        return (
          <g key={r.key}>
            <text x={LABEL} y={y + 4} fontSize={12} fill="#0f172a" textAnchor="end">
              {r.label.length > 34 ? `${r.label.slice(0, 33)}…` : r.label}
              <title>{`${r.label}: ${r.n} карток, медіана ${shortNumber(r.median)} ${unit}`}</title>
            </text>
            <line x1={x(r.p5)} x2={x(r.p95)} y1={y} y2={y} stroke={LINE} />
            <rect x={x(r.q1)} y={y - 7} width={Math.max(x(r.q3) - x(r.q1), 1)} height={14} fill={BOX} stroke={LINE} />
            <line x1={x(r.median)} x2={x(r.median)} y1={y - 7} y2={y + 7} stroke="#0f172a" strokeWidth={2} />
            {r.flagged.map((f) => (
              <a key={f.listingId} href={listingHref(f.listingId)}>
                <circle cx={x(f.value)} cy={y} r={4} fill={FLAG} fillOpacity={0.8} />
                <title>{`[${f.chain}] ${f.name}: ${shortNumber(f.value)} ${unit}`}</title>
              </a>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Гістограма відношення цін (кошики рівні на лог. шкалі). Висота — log(1 + кількість):
 * інакше кошик «×1» у сотні разів вищий за решту, і хвости не видно.
 */
export function RatioHistogram({ bins, limit }: { bins: QualityBinDto[]; limit: number }) {
  const W = 900;
  const H = 200;
  const PAD = { top: 18, bottom: 34, left: 10, right: 10 };
  const max = Math.max(...bins.map((b) => b.count), 1);
  const bw = (W - PAD.left - PAD.right) / bins.length;
  const h = (c: number) => (Math.log10(1 + c) / Math.log10(1 + max)) * (H - PAD.top - PAD.bottom);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Гістограма: ціна ÷ медіана інших мереж">
      {bins.map((b, i) => {
        const off = b.to <= 1 / limit + 1e-9 || b.from >= limit - 1e-9;
        const x = PAD.left + i * bw;
        const y = H - PAD.bottom - h(b.count);
        return (
          <g key={i}>
            <rect x={x + 2} y={y} width={bw - 4} height={h(b.count)} fill={off ? FLAG : BOX} />
            {b.count > 0 && (
              <text x={x + bw / 2} y={y - 4} fontSize={11} fill={TEXT} textAnchor="middle">
                {b.count}
              </text>
            )}
            <text x={x + bw / 2} y={H - PAD.bottom + 14} fontSize={10} fill={TEXT} textAnchor="middle">
              {i === 0 ? `<${ratioLabel(b.to)}` : i === bins.length - 1 ? `>${ratioLabel(b.from)}` : ratioLabel(b.from)}
            </text>
          </g>
        );
      })}
      <text x={W / 2} y={H - 4} fontSize={11} fill={TEXT} textAnchor="middle">
        ціна картки ÷ медіана ціни того самого фасування в інших мережах країни
      </text>
    </svg>
  );
}

/** Ціна за одиницю від розміру упаковки, log–log, з прямою Theil–Sen; червоне — викиди залишків */
export function LogLogScatter({ points, fit, unit }: { points: ScatterPointDto[]; fit: FitDto | null; unit: string }) {
  if (points.length === 0) return <p className="text-sm text-slate-500">Немає даних.</p>;
  const W = 900;
  const H = 360;
  const PAD = { top: 12, right: 12, bottom: 34, left: 56 };
  const sizes = points.map((p) => p.size);
  const units = points.map((p) => p.unit);
  const [sx0, sx1] = [Math.min(...sizes) / 1.2, Math.max(...sizes) * 1.2];
  const [sy0, sy1] = [Math.min(...units) / 1.3, Math.max(...units) * 1.3];
  const x = logScale(sx0, sx1, PAD.left, W - PAD.right);
  const yUp = logScale(sy0, sy1, 0, H - PAD.top - PAD.bottom);
  const y = (v: number) => H - PAD.bottom - yUp(v);
  // Пряма: ln(ціна) = intercept + slope · ln(розмір)
  const line =
    fit &&
    [sx0, sx1].map((s) => ({
      x: x(s),
      y: y(Math.exp(fit.intercept + fit.slope * Math.log(s))),
    }));
  const ordered = [...points].sort((a, b) => Number(a.outlier) - Number(b.outlier));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ціна за одиницю від розміру упаковки">
      <defs>
        <clipPath id="plot">
          <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom} />
        </clipPath>
      </defs>
      {logTicks(sx0, sx1).map((t) => (
        <g key={`x${t}`}>
          <line x1={x(t)} x2={x(t)} y1={PAD.top} y2={H - PAD.bottom} stroke={GRID} />
          <text x={x(t)} y={H - PAD.bottom + 14} fontSize={11} fill={TEXT} textAnchor="middle">
            {shortNumber(t)}
          </text>
        </g>
      ))}
      {logTicks(sy0, sy1).map((t) => (
        <g key={`y${t}`}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} />
          <text x={PAD.left - 6} y={y(t) + 4} fontSize={11} fill={TEXT} textAnchor="end">
            {shortNumber(t)}
          </text>
        </g>
      ))}
      <text x={W / 2} y={H - 4} fontSize={11} fill={TEXT} textAnchor="middle">
        розмір упаковки (г / мл / шт) → ціна за {unit}
      </text>
      <g clipPath="url(#plot)">
        {line && (
          <line x1={line[0].x} y1={line[0].y} x2={line[1].x} y2={line[1].y} stroke={LINE} strokeDasharray="6 4" />
        )}
        {ordered.map((p) =>
          p.outlier ? (
            <a key={p.listingId} href={listingHref(p.listingId)}>
              <circle cx={x(p.size)} cy={y(p.unit)} r={4.5} fill={FLAG} />
              <title>{`[${p.chain}] ${p.name}: ${shortNumber(p.size)} → ${shortNumber(p.unit)} за ${unit}`}</title>
            </a>
          ) : (
            <circle key={p.listingId} cx={x(p.size)} cy={y(p.unit)} r={2.5} fill="#64748b" fillOpacity={0.35}>
              <title>{`[${p.chain}] ${p.name}: ${shortNumber(p.size)} → ${shortNumber(p.unit)} за ${unit}`}</title>
            </circle>
          ),
        )}
      </g>
    </svg>
  );
}

import type { ScrapeRunDto } from '@/api/generated/model';
import { formatEta, formatNumber } from '@/lib/format';

/**
 * Прогрес обходу: частка від попереднього вдалого обходу мережі й приблизний час до кінця.
 * Перший обхід мережі — без оцінки (смуга «біжить»), лише кількість записаних товарів.
 */
export function RunProgress({ run }: { run: ScrapeRunDto }) {
  if (run.status === 'QUEUED') return <span className="text-xs text-slate-500">чекає в черзі парсера</span>;
  if (run.status !== 'RUNNING') return null;
  const known = run.fraction !== null;
  const percent = Math.round((run.fraction ?? 0) * 100);
  return (
    <div className="min-w-48 space-y-1">
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? percent : undefined}
      >
        {known ? (
          <div className="h-full rounded-full bg-blue-600 transition-[width] duration-700" style={{ width: `${Math.max(percent, 2)}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-300" />
        )}
      </div>
      <div className="flex justify-between gap-3 text-xs text-slate-600 tabular-nums">
        <span>
          {formatNumber(run.itemsSeen)}
          {run.expectedItems !== null && ` з ~${formatNumber(run.expectedItems)}`} тов.
          {known && ` · ${percent} %`}
        </span>
        <span className="font-medium text-slate-800">
          {run.etaSeconds !== null ? `залишилось ${formatEta(run.etaSeconds)}` : 'перший обхід — без оцінки'}
        </span>
      </div>
    </div>
  );
}

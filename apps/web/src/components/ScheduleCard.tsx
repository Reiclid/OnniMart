'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { runAllScrapesAction, updateScheduleAction } from '@/app/actions';
import type { ScheduleDto, UpdateScheduleDto } from '@/api/generated/model';
import { formatCountdown, formatDateTime } from '@/lib/format';

const PERIODS = [6, 12, 24, 48, 72];

/** Розклад обходів (Огляд): таймер до наступного, період, "Запустити зараз" і чи скидає він таймер */
export function ScheduleCard({ schedule }: { schedule: ScheduleDto }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [custom, setCustom] = useState(String(schedule.intervalHours));
  const [now, setNow] = useState<number | null>(null);

  const next = schedule.nextRunAt ? Date.parse(schedule.nextRunAt) : null;
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = next !== null && now !== null ? next - now : null;
  // Час настав: воркер перевіряє щохвилини — оновлюємо сторінку, щоб побачити запуски
  const due = left !== null && left <= 0;
  useEffect(() => {
    if (!due) return;
    const timer = setTimeout(() => startTransition(() => router.refresh()), 15_000);
    return () => clearTimeout(timer);
  }, [due, router, now]);

  async function act(call: () => Promise<{ error: string | null }>, done?: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    const { error } = await call();
    setBusy(false);
    if (error) setError(error);
    else {
      setNote(done ?? null);
      startTransition(() => router.refresh());
    }
  }
  const save = (patch: UpdateScheduleDto) => act(() => updateScheduleAction(patch));

  const soon = schedule.chains.filter(
    (chain) => !chain.active && next !== null && Date.parse(chain.nextRunAt) - next < 60_000,
  );
  const hours = Number(custom);
  const customValid = Number.isInteger(hours) && hours >= 1 && hours <= 336;

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Розклад обходів</h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={schedule.enabled}
            disabled={busy}
            onChange={(e) => save({ enabled: e.target.checked })}
            className="size-4 accent-blue-600"
          />
          Обходити за розкладом
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <div className="text-xs text-slate-500">До наступного обходу</div>
          <div className="text-4xl font-semibold tabular-nums text-slate-900" aria-live="off">
            {!schedule.enabled ? '—' : left === null ? (next === null ? '—' : '…') : formatCountdown(left)}
          </div>
        </div>
        <div className="pb-1 text-sm text-slate-600">
          {!schedule.enabled ? (
            'Розклад вимкнено — мережі обходяться лише вручну'
          ) : next === null ? (
            'Усі мережі зараз у черзі або в обході'
          ) : (
            <>
              {due ? 'Зараз (воркер ставить у чергу щохвилини)' : formatDateTime(schedule.nextRunAt)}
              {soon.length > 0 && (
                <span className="text-slate-400">
                  {' · '}
                  {soon
                    .slice(0, 4)
                    .map((chain) => chain.name)
                    .join(', ')}
                  {soon.length > 4 && ` +${soon.length - 4}`}
                </span>
              )}
            </>
          )}
          {schedule.activeRuns > 0 && (
            <div className="text-blue-700">У черзі або в обході: {schedule.activeRuns}</div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Період:</span>
        {PERIODS.map((period) => (
          <button
            key={period}
            type="button"
            disabled={busy}
            onClick={() => {
              setCustom(String(period));
              void save({ intervalHours: period });
            }}
            aria-pressed={schedule.intervalHours === period}
            className="rounded-full border border-slate-300 px-3 py-1 tabular-nums hover:border-blue-400 aria-pressed:border-blue-600 aria-pressed:bg-blue-600 aria-pressed:text-white"
          >
            {period} год
          </button>
        ))}
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (customValid) void save({ intervalHours: hours });
          }}
        >
          <input
            type="number"
            min={1}
            max={336}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            aria-label="Свій період, годин"
            className="w-20 rounded border border-slate-300 px-2 py-1 tabular-nums"
          />
          <button
            type="submit"
            disabled={busy || !customValid || hours === schedule.intervalHours}
            className="rounded border border-slate-300 px-2 py-1 hover:border-blue-400 disabled:opacity-40"
          >
            Зберегти
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => act(runAllScrapesAction, 'Повний обхід поставлено в чергу')}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {busy ? 'Зачекайте…' : 'Запустити всі зараз'}
        </button>
        <label className="flex max-w-xl cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={schedule.manualResetsTimer}
            disabled={busy}
            onChange={(e) => save({ manualResetsTimer: e.target.checked })}
            className="mt-0.5 size-4 accent-blue-600"
          />
          <span>
            Ручний запуск замінює плановий
            <span className="block text-xs text-slate-500">
              {schedule.manualResetsTimer
                ? 'Таймер починається з нуля від ручного запуску.'
                : 'Плановий обхід однаково відбудеться у свій час, навіть одразу після ручного.'}
            </span>
          </span>
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {note && <p className="text-sm text-green-700">{note}</p>}
    </section>
  );
}

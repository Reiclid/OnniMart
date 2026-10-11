'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { triggerScrape } from '@/api/generated/scraper/scraper';

/** Запуск парсингу мережі: тестовий (N сторінок на категорію) або повний */
export function TriggerButton({ store }: { store: string }) {
  const router = useRouter();
  const [maxPages, setMaxPages] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await triggerScrape({
        store,
        maxPages: maxPages === 'all' ? undefined : Number(maxPages),
      });
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося запустити');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <select
          value={maxPages}
          onChange={(e) => setMaxPages(e.target.value)}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
          aria-label="Обсяг запуску"
        >
          <option value="1">1 стор./категорію</option>
          <option value="3">3 стор./категорію</option>
          <option value="all">Усе</option>
        </select>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {busy ? 'Запуск…' : 'Запустити'}
        </button>
      </div>
      {error && <p className="max-w-64 text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { resetVariationAction, setVariationAction } from '@/app/actions';
import type { ActionResult } from '@/app/actions';

/** Виконати дію, показати помилку, оновити сторінку */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  async function run(call: () => Promise<ActionResult>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const { error } = await call();
    setBusy(false);
    if (error) {
      setError(error);
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }
  return { busy, error, run };
}

const BUTTON = 'whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium disabled:opacity-50';

/** Кнопки рядка: вимкнути / увімкнути слово або повернути рішення даним */
export function VariationRowActions({ word, status }: { word: string; status: string }) {
  const { busy, error, run } = useAction();
  const manual = status === 'added' || status === 'removed';
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex gap-1">
        {status !== 'removed' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const note = window.prompt(`Чому «${word}» не варіація? (необовʼязково)`);
              if (note !== null) void run(() => setVariationAction(word, 'REMOVE', note));
            }}
            className={`${BUTTON} border border-red-200 text-red-700 hover:bg-red-50`}
          >
            Вимкнути
          </button>
        )}
        {status !== 'added' && status !== 'learned' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => setVariationAction(word, 'ADD'))}
            className={`${BUTTON} border border-green-200 text-green-700 hover:bg-green-50`}
          >
            Увімкнути
          </button>
        )}
        {manual && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => resetVariationAction(word))}
            className={`${BUTTON} border border-slate-300 text-slate-600 hover:bg-slate-50`}
            title="Прибрати ручне рішення: слово знову вирішують дані"
          >
            Як у даних
          </button>
        )}
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

/** Додати слово вручну: завжди варіація (вага 1) */
export function AddVariationForm() {
  const { busy, error, run } = useAction();
  const [word, setWord] = useState('');
  const [note, setNote] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => setVariationAction(word, 'ADD', note))) {
          setWord('');
          setNote('');
        }
      }}
    >
      <label className="flex flex-col gap-1">
        Слово
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          required
          placeholder="stracciatella"
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        Чому (необовʼязково)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="смак Almighurt"
          maxLength={200}
          className="w-64 rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <button
        disabled={busy}
        className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Додати варіацію
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { mergeBrandAction, renameBrandAction } from '@/app/actions';
import type { ActionResult } from '@/app/actions';

const BUTTON = 'whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium disabled:opacity-50';
const MERGE_WARNING = 'Злиття не скасовується: товари й лінійки перейдуть до основного бренду, а дублікат зникне.';

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  async function run(call: () => Promise<ActionResult>) {
    setBusy(true);
    setError(null);
    const { error } = await call();
    setBusy(false);
    if (error) setError(error);
    else startTransition(() => router.refresh());
  }
  return { busy, error, run };
}

/** Кнопки рядка бренду: перейменувати, злити в інший бренд за ключем */
export function BrandRowActions({ id, name, slug }: { id: string; name: string; slug: string }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex gap-1">
        <button
          type="button"
          disabled={busy}
          className={`${BUTTON} border border-slate-300 text-slate-700 hover:bg-slate-50`}
          onClick={() => {
            const next = window.prompt(`Нова назва для «${name}» (ключ «${slug}» не зміниться)`, name);
            if (next && next.trim() !== name) void run(() => renameBrandAction(id, next));
          }}
        >
          Перейменувати
        </button>
        <button
          type="button"
          disabled={busy}
          className={`${BUTTON} border border-amber-300 text-amber-800 hover:bg-amber-50`}
          onClick={() => {
            const into = window.prompt(`Злити «${name}» у бренд з ключем… (напр. san-pellegrino)\n${MERGE_WARNING}`);
            if (into?.trim()) void run(() => mergeBrandAction(id, into));
          }}
        >
          Злити в…
        </button>
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

/** Злиття підказаної пари дублікатів: менший у більший або навпаки */
export function MergePair({
  source,
  target,
}: {
  source: { id: string; name: string };
  target: { id: string; name: string };
}) {
  const { busy, error, run } = useAction();
  const merge = (from: typeof source, into: typeof target) => {
    if (window.confirm(`Злити «${from.name}» у «${into.name}»?\n${MERGE_WARNING}`)) {
      void run(() => mergeBrandAction(from.id, into.id));
    }
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => merge(source, target)}
          className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-700`}
        >
          Злити в «{target.name}»
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => merge(target, source)}
          className={`${BUTTON} border border-slate-300 text-slate-600 hover:bg-slate-50`}
          title={`Залишити «${source.name}» основним`}
        >
          навпаки
        </button>
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

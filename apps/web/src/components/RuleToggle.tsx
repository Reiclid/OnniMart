'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setMatchingRuleAction } from '@/app/actions';

/** Перемикач правила зіставлення: діє з наступного пакета */
export function RuleToggle({ ruleKey, title, enabled }: { ruleKey: string; title: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function toggle() {
    if (enabled && !window.confirm(`Вимкнути «${title}»? Нові картки зіставлятимуться без цього правила.`)) return;
    setBusy(true);
    setError(null);
    const result = await setMatchingRuleAction(ruleKey, !enabled);
    setBusy(false);
    if (result.error) setError(result.error);
    else startTransition(() => router.refresh());
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={title}
        disabled={busy}
        onClick={() => void toggle()}
        className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
          enabled ? 'bg-green-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-5' : ''
          }`}
        />
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

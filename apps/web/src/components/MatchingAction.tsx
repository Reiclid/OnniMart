'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  acceptCandidate,
  rejectCandidates,
  runMatching,
  unlinkListing,
} from '@/api/generated/matching/matching';

type Action =
  | { kind: 'run' }
  | { kind: 'accept'; candidateId: string }
  | { kind: 'reject'; listingId: string }
  | { kind: 'unlink'; listingId: string };

const STYLES = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  success: 'bg-green-600 text-white hover:bg-green-700',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
};

function perform(action: Action) {
  switch (action.kind) {
    case 'run':
      return runMatching();
    case 'accept':
      return acceptCandidate(action.candidateId);
    case 'reject':
      return rejectCandidates(action.listingId);
    case 'unlink':
      return unlinkListing(action.listingId);
  }
}

/** Кнопка дії зіставлення: запуск, підтвердження кандидата, відхилення, відвʼязування */
export function MatchingAction({
  action,
  label,
  variant = 'primary',
  confirm,
}: {
  action: Action;
  label: string;
  variant?: keyof typeof STYLES;
  /** Текст підтвердження перед дією */
  confirm?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError(null);
    try {
      await perform(action);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося виконати дію');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={`whitespace-nowrap rounded px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${STYLES[variant]}`}
      >
        {busy ? '…' : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

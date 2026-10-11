'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-lg border border-red-200 bg-white p-6">
      <h1 className="text-xl font-bold text-red-700">Не вдалося отримати дані</h1>
      <p className="text-sm text-slate-600">{error.message}</p>
      <p className="text-sm text-slate-600">
        Перевірте, що запущені інфраструктура (<code>bun run infra:up</code>) та API (
        <code>bun run dev:api</code>, порт 3001).
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white"
      >
        Спробувати ще раз
      </button>
    </div>
  );
}

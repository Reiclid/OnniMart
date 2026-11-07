'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Поки є активні запуски, раз на кілька секунд питає легкий `probe` і перезавантажує
 * сторінку лише тоді, коли його відбиток відрізняється від `signature` — відбитка,
 * з яким сторінку зібрав сервер.
 */
export function AutoRefresh({
  active,
  signature,
  probe,
  intervalMs = 15000,
  settleMs = 35000,
}: {
  active: boolean;
  signature: string;
  /** Поточний відбиток або null, якщо його не вдалося дізнатися */
  probe: () => Promise<string | null>;
  intervalMs?: number;
  /** Скільки чекати після кінця запуску, щоб кеш API (30 с) оновився й сторінка показала підсумок */
  settleMs?: number;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const wasActive = useRef(false);

  // Запуск скінчився: останній refresh міг узяти лічильники з кешу API, тож оновлюємо ще раз
  useEffect(() => {
    if (active) {
      wasActive.current = true;
      return;
    }
    if (!wasActive.current) return;
    wasActive.current = false;
    const id = setTimeout(() => router.refresh(), settleMs);
    return () => clearTimeout(id);
  }, [active, settleMs, router]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const next = await probe();
        if (next !== null && next !== signature) router.refresh();
      } catch {
        // мережу чи сервер ще не піднято — спробуємо на наступному кроці
      } finally {
        busy.current = false;
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, signature, probe, intervalMs, router]);

  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-blue-700">
      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
      Парсер працює — дані оновлюються автоматично
    </span>
  );
}

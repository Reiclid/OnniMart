'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Поки є активні запуски, перезавантажує дані сторінки кожні кілька секунд */
export function AutoRefresh({
  active,
  intervalMs = 15000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-blue-700">
      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
      Парсер працює — дані оновлюються автоматично
    </span>
  );
}

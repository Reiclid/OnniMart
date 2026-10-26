'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeftIcon } from './ui';

/** «Назад» над фото товару (Figma: 03 Товар): повертає туди, звідки прийшли (пошук зі скролом), а з прямого посилання — у каталог */
export function BackButton({ fallback, label, className = '' }: { fallback: string; label: string; className?: string }) {
  const router = useRouter();
  const back = () => (history.length > 1 ? router.back() : router.push(fallback));
  return (
    <button
      type="button"
      onClick={back}
      aria-label={label}
      className={`press grid size-11 place-items-center rounded-full border border-line bg-surface text-icon shadow-floating ${className}`}
    >
      <ChevronLeftIcon width={22} height={22} />
    </button>
  );
}

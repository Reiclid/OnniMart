'use client';

import Link from 'next/link';
import { useT } from '@/i18n/client';
import { ScanIcon, SearchIcon } from './ui';

/** Пошук за назвою або штрихкодом; сканер живе тут, а не окремою кнопкою */
export function SearchField({ q }: { q?: string }) {
  const t = useT();
  return (
    <form action="/products" role="search" className="flex h-13 items-center gap-3 rounded-lg border border-line bg-surface pl-4 pr-1.5 focus-within:border-accent">
      <SearchIcon className="shrink-0 text-icon-muted" />
      <input
        name="q"
        defaultValue={q}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-fg-muted"
      />
      <Link href="/scan" aria-label={t('search.scan')} className="grid size-10 shrink-0 place-items-center rounded-md bg-brand text-white">
        <ScanIcon />
      </Link>
    </form>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import { useT } from '@/i18n/client';
import { catalogHref, type CatalogFilters as Filters } from '@/lib/catalog-filters';
import { CheckIcon, ChevronDownIcon } from './ui';

type Option = { value: string; label: string; count?: number };

const pill = (selected: boolean) =>
  `press flex shrink-0 items-center gap-1 rounded-full border py-2 pl-3.5 pr-2.5 text-body-sm font-semibold [--press-scale:0.96] ${
    selected ? 'border-accent bg-selected text-brand' : 'border-line bg-surface text-fg hover:border-line-strong'
  }`;

/**
 * Фільтри каталогу одним рядком: категорія й мережа відкривають список (на телефоні — шторка
 * знизу, на десктопі — під кнопкою), "Акції" і "У 2+ мережах" — перемикачі. Пошуковий запит зберігається.
 */
export function CatalogFilters({ filters, categories, chains }: { filters: Filters; categories: Option[]; chains: Option[] }) {
  const t = useT();
  const [open, setOpen] = useState<'category' | 'chain' | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  const lists = {
    category: { title: t('filters.categories'), all: t('filters.allCategories'), options: categories },
    chain: { title: t('filters.chains'), all: t('filters.allChains'), options: chains },
  };
  const label = (param: 'category' | 'chain') =>
    lists[param].options.find((o) => o.value === filters[param])?.label ?? lists[param].title;
  const active = !!(filters.category || filters.chain || filters.onPromo || filters.multiChain);
  const list = open && lists[open];

  return (
    <div className="relative">
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none]">
        {(['category', 'chain'] as const).map((param) => (
          <button
            key={param}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open === param}
            onClick={() => setOpen(open === param ? null : param)}
            className={pill(!!filters[param])}
          >
            <span className="max-w-40 truncate">{label(param)}</span>
            <ChevronDownIcon width={16} height={16} className={`transition-transform duration-(--duration-fast) ${open === param ? 'rotate-180' : ''}`} />
          </button>
        ))}
        {([['onPromo', t('filters.onPromo')], ['multiChain', t('filters.multiChain')]] as const).map(([param, title]) => (
          <Link
            key={param}
            href={catalogHref({ ...filters, [param]: !filters[param] })}
            scroll={false}
            aria-pressed={!!filters[param]}
            className={`${pill(!!filters[param])} pr-3.5`}
          >
            {filters[param] && <CheckIcon width={16} height={16} />}
            {title}
          </Link>
        ))}
        {active && (
          <Link href={catalogHref({ q: filters.q })} scroll={false} className="shrink-0 px-2 text-body-sm font-semibold text-brand">
            {t('filters.clear')}
          </Link>
        )}
      </div>

      {list && open && (
        <>
          <button type="button" aria-label={t('filters.close')} onClick={() => setOpen(null)} className="fixed inset-0 z-30 cursor-default bg-fg/30 md:bg-transparent" />
          <div
            role="dialog"
            aria-label={list.title}
            style={{ '--appear-y': '24px' } as CSSProperties}
            className="appear fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-floating md:absolute md:inset-x-auto md:top-full md:bottom-auto md:mt-2 md:max-h-96 md:w-80 md:rounded-lg md:border md:border-line"
          >
            <div className="sticky top-0 flex items-center justify-between bg-surface px-4 pt-4 pb-2 md:hidden">
              <span className="text-title-sm font-bold">{list.title}</span>
              <button type="button" onClick={() => setOpen(null)} className="text-body-sm font-semibold text-brand">
                {t('filters.close')}
              </button>
            </div>
            <ul className="py-1">
              {[{ value: '', label: list.all } as Option, ...list.options].map((option) => {
                const selected = (filters[open] ?? '') === option.value;
                return (
                  <li key={option.value}>
                    <Link
                      href={catalogHref({ ...filters, [open]: option.value || undefined })}
                      scroll={false}
                      onClick={() => setOpen(null)}
                      aria-current={selected ? 'true' : undefined}
                      className={`flex items-center gap-3 px-4 py-3 text-body hover:bg-page ${selected ? 'font-semibold text-brand' : ''}`}
                    >
                      <span className="flex-1 truncate">{option.label}</span>
                      {option.count !== undefined && <span className="text-body-sm text-fg-muted tabular-nums">{option.count}</span>}
                      <CheckIcon width={18} height={18} className={selected ? '' : 'invisible'} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { searchSuggestions, type SearchSuggestions } from '@/app/(shop)/actions';
import { useT } from '@/i18n/client';
import { catalogHref, type CatalogFilters } from '@/lib/catalog-filters';
import { rememberQuery } from '@/lib/suggestions';
import { ArrowUpLeftIcon, ClockIcon, CloseIcon, GridIcon, ProductImage, ScanIcon, SearchIcon } from './ui';

const RECENT_KEY = 'onnimart:recent-searches';
/** Підказки — з другої літери й після паузи у введенні */
const MIN_LENGTH = 2;
const DELAY_MS = 150;

function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(rememberQuery(readRecent(), query)));
  } catch {
    // приватне вікно — недавні просто не запам'ятовуються
  }
}

type Row = { key: string; href: string; query?: string; content: ReactNode; icon?: ReactNode; fill?: string };

/**
 * Пошук за назвою або штрихкодом; сканер живе тут. Фільтри каталогу (`filters`) їдуть з
 * запитом прихованими полями — новий чи стертий пошук їх не скидає. У фокусі — список під
 * полем (Figma: Search — opened / typing): недавні й популярні, під час введення — підказки.
 */
export function SearchField({ q, filters = {} }: { q?: string; filters?: CatalogFilters }) {
  const t = useT();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(q ?? '');
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  // Останні підказки лишаються, поки не прийдуть нові, — список не блимає між літерами
  const [data, setData] = useState<SearchSuggestions | null>(null);
  const [active, setActive] = useState(-1);
  const typed = value.trim();

  useEffect(() => {
    if (!open || typed.length < MIN_LENGTH) return;
    let stale = false;
    const timer = setTimeout(() => {
      searchSuggestions(typed).then(
        (next) => !stale && setData(next),
        () => undefined,
      );
    }, DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [typed, open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !form.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const kept = Object.entries({ category: filters.category, chain: filters.chain, onPromo: filters.onPromo && 'true', multiChain: filters.multiChain && 'true' }).filter(
    (entry): entry is [string, string] => !!entry[1],
  );
  const search = (query: string) => catalogHref({ ...filters, q: query });
  // Збіг з тим, що введено, — жирним
  const bold = (text: string) =>
    text.toLowerCase().startsWith(typed.toLowerCase()) ? (
      <>
        <b className="font-bold">{text.slice(0, typed.length)}</b>
        {text.slice(typed.length)}
      </>
    ) : (
      text
    );

  const rows: Row[] =
    typed.length >= MIN_LENGTH && data
      ? [
          ...data.queries.map((s) => ({ key: `q:${s}`, href: search(s), query: s, content: bold(s), icon: <SearchIcon width={20} height={20} />, fill: s })),
          ...(data.category
            ? [
                {
                  key: `c:${data.category.slug}`,
                  href: catalogHref({ ...filters, q: typed, category: data.category.slug }),
                  query: typed,
                  icon: <GridIcon width={20} height={20} />,
                  content: (
                    <>
                      {bold(typed)} {t('search.in')} <span className="text-brand">{data.category.name}</span>
                    </>
                  ),
                },
              ]
            : []),
          ...data.products.map((p) => ({
            key: `p:${p.id}`,
            href: `/products/${p.id}`,
            content: (
              <span className="flex items-center gap-3">
                <ProductImage src={p.imageUrl} className="size-10 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate">{p.name}</span>
                  {p.price && <span className="block text-body-sm text-fg-muted tabular-nums">{t('search.productMeta', { price: p.price, count: p.chains })}</span>}
                </span>
              </span>
            ),
          })),
          { key: 'all', href: search(typed), query: typed, content: <span className="font-semibold text-brand">{t('search.seeAll', { q: typed })}</span> },
        ]
      : typed.length === 0
        ? recent.map((r) => ({ key: `r:${r}`, href: search(r), query: r, content: r, icon: <ClockIcon width={20} height={20} />, fill: r }))
        : [];
  const productsStart = rows.findIndex((r) => r.key.startsWith('p:'));
  const showPanel = open && (rows.length > 0 || typed.length === 0);

  function go(row: Row) {
    if (row.query) saveRecent(row.query);
    setOpen(false);
    router.push(row.href);
  }

  return (
    <>
      {showPanel && <div aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-fg/25 md:bg-transparent" />}
      <form
        ref={form}
        action="/products"
        role="search"
        onSubmit={() => {
          saveRecent(value);
          setOpen(false);
        }}
        className={`relative flex h-13 items-center gap-3 rounded-lg border bg-surface pl-4 pr-1.5 border-line focus-within:border-brand focus-within:ring-1 focus-within:ring-brand ${showPanel ? 'z-40' : ''}`}
      >
        <SearchIcon className="shrink-0 text-icon-muted" />
        <input
          ref={input}
          name="q"
          value={value}
          autoComplete="off"
          onChange={(e) => {
            setValue(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => {
            setRecent(readRecent());
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              input.current?.blur();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const step = e.key === 'ArrowDown' ? 1 : -1;
              setActive((i) => (rows.length ? (i + step + rows.length + 1) % (rows.length + 1) : -1));
            } else if (e.key === 'Enter' && rows[active]) {
              e.preventDefault();
              go(rows[active]);
            }
          }}
          enterKeyHint="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          placeholder={t('search.placeholder')}
          aria-label={t('search.label')}
          className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-fg-muted"
        />
        {kept.map(([name, v]) => (
          <input key={name} type="hidden" name={name} value={v} />
        ))}
        {value && (
          <button
            type="button"
            aria-label={t('search.clear')}
            onClick={() => {
              setValue('');
              input.current?.focus();
              // Був запит — показуємо каталог з тими самими фільтрами без нього
              if (q) router.push(catalogHref({ ...filters, q: undefined }));
            }}
            className="grid size-8 shrink-0 place-items-center rounded-full text-icon-muted hover:text-fg"
          >
            <CloseIcon width={18} height={18} />
          </button>
        )}
        <Link href="/scan" aria-label={t('search.scan')} className="grid size-10 shrink-0 place-items-center rounded-md bg-brand text-white">
          <ScanIcon />
        </Link>

        {showPanel && (
          <div
            id="search-suggestions"
            role="listbox"
            style={{ '--appear-y': '-6px' } as CSSProperties}
            className="appear absolute inset-x-0 top-full mt-2 max-h-[60vh] overflow-y-auto rounded-lg border border-line bg-surface py-2 shadow-floating"
          >
            {typed.length === 0 && recent.length > 0 && <Heading>{t('search.recent')}</Heading>}
            {rows.map((row, i) => (
              <div key={row.key}>
                {i === productsStart && (
                  <>
                    <hr className="my-1 border-line" />
                    <Heading>{t('search.products')}</Heading>
                  </>
                )}
                <div
                  role="option"
                  aria-selected={i === active}
                  className={`flex items-center gap-3 px-4 text-body ${i === active ? 'bg-page' : 'hover:bg-page'}`}
                >
                  {row.icon && <span className="shrink-0 text-icon-muted">{row.icon}</span>}
                  <Link
                    href={row.href}
                    onClick={(e) => {
                      e.preventDefault();
                      go(row);
                    }}
                    className="min-w-0 flex-1 truncate py-2.5"
                  >
                    {row.content}
                  </Link>
                  {row.fill && (
                    <button
                      type="button"
                      aria-label={t('search.fill', { q: row.fill })}
                      onClick={() => {
                        setValue(`${row.fill} `);
                        input.current?.focus();
                      }}
                      className="grid size-8 shrink-0 place-items-center text-icon-muted hover:text-fg"
                    >
                      <ArrowUpLeftIcon width={18} height={18} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {typed.length === 0 && (
              <>
                <Heading>{t('search.popular')}</Heading>
                <div className="flex flex-wrap gap-2 px-4 pt-1 pb-2">
                  {t('search.popularList')
                    .split(',')
                    .map((p) => p.trim())
                    .map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => go({ key: p, href: search(p), query: p, content: p })}
                        className="press rounded-full border border-line bg-surface px-3.5 py-2 text-body-sm font-semibold hover:border-line-strong"
                      >
                        {p}
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        )}
      </form>
    </>
  );
}

const Heading = ({ children }: { children: ReactNode }) => (
  <div className="px-4 pt-2 pb-1 text-caption font-semibold uppercase text-fg-muted">{children}</div>
);

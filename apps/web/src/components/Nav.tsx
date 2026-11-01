'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from '@/i18n/client';
import type { MessageKey } from '@/i18n';
import { parseCatalogFilters } from '@/lib/catalog-filters';
import { SearchField } from './SearchField';
import { BellIcon, GridIcon, HomeIcon, SearchIcon, UserIcon } from './ui';

const TABS: { href: string; label: MessageKey; Icon: typeof HomeIcon }[] = [
  { href: '/', label: 'nav.home', Icon: HomeIcon },
  { href: '/products', label: 'nav.catalog', Icon: GridIcon },
  { href: '/alerts', label: 'nav.alerts', Icon: BellIcon },
  { href: '/profile', label: 'nav.profile', Icon: UserIcon },
];

/** Активна вкладка: Home — лише "/", решта — разом із вкладеними сторінками */
const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`) || (href === '/profile' && /^\/(settings|login)(\/|$)/.test(pathname));

/** Поле пошуку сторінки (головна, каталог); у шапці на десктопі — не рахується */
const PAGE_SEARCH = 'main form[role="search"]';

/**
 * Пошук сховався: поле сторінки прокручене вгору за екран, а на сторінках без поля —
 * прокрутили вниз. Тоді в таб-барі з'являється кнопка пошуку.
 */
function useSearchHidden(pathname: string) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const field = document.querySelector(PAGE_SEARCH);
    if (!field) {
      const onScroll = () => setHidden(window.scrollY > 160);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }
    const observer = new IntersectionObserver(([entry]) => setHidden(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(field);
    return () => observer.disconnect();
  }, [pathname]);
  return hidden;
}

const button =
  'press grid size-13 shrink-0 place-items-center rounded-lg border shadow-floating transition-colors duration-(--duration-fast) ease-standard [--press-scale:0.92]';
const idle = 'border-line bg-surface/90 text-icon backdrop-blur';

/** Ряд 300 px: 4 кнопки по 52 — відступ (300 − 208) / 3; з пошуком 5 кнопок — (300 − 260) / 4 */
const GAP_FOUR = 92 / 3;
const GAP_FIVE = 10;

/**
 * Нижня навігація на телефоні (Figma: Tab bar): окремі квадратні кнопки без підписів у ряд
 * 300 px. Коли поле пошуку сховалось, посередині виростає кнопка пошуку, відступи стискаються.
 */
export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const searchHidden = useSearchHidden(pathname);
  const gap = searchHidden ? GAP_FIVE : GAP_FOUR;

  function openSearch() {
    const input = document.querySelector<HTMLInputElement>(`${PAGE_SEARCH} input[name="q"]`);
    if (!input) return router.push('/products');
    // Фокус одразу в обробнику дотику — інакше iOS не покаже клавіатуру
    input.focus({ preventScroll: true });
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
  }

  const tab = ({ href, label, Icon }: (typeof TABS)[number]) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-label={t(label)}
        aria-current={active ? 'page' : undefined}
        className={`${button} ${active ? 'border-brand bg-brand text-white' : idle}`}
      >
        {/* Нова вкладка: іконка «вискакує» 0,9 → 1 (клас з'являється лише в момент переходу) */}
        <Icon width={24} height={24} className={active ? 'pop-in' : undefined} />
      </Link>
    );
  };

  return (
    <nav
      aria-label={t('nav.main')}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center pb-[calc(env(safe-area-inset-bottom)+12px)] md:hidden"
    >
      <div
        style={{ gap }}
        className="pointer-events-auto flex w-75 items-center justify-center transition-[gap] duration-(--duration-spring-snappy) ease-spring-snappy"
      >
        {TABS.slice(0, 2).map(tab)}
        {/* Пошук виростає з нуля посередині; від'ємний відступ гасить зайвий gap, поки її немає */}
        <div
          inert={!searchHidden}
          style={{ marginLeft: searchHidden ? 0 : -gap }}
          className={`flex justify-center transition-[width,margin,opacity,scale] duration-(--duration-spring-snappy) ease-spring-snappy ${
            searchHidden ? 'w-13 opacity-100' : 'pointer-events-none w-0 scale-50 opacity-0'
          }`}
        >
          <button type="button" onClick={openSearch} aria-label={t('nav.search')} className={`${button} ${idle}`}>
            <SearchIcon width={24} height={24} />
          </button>
        </div>
        {TABS.slice(2).map(tab)}
      </div>
    </nav>
  );
}

const LINKS: { href: string; label: MessageKey }[] = [
  { href: '/products', label: 'nav.catalog' },
  { href: '/alerts', label: 'nav.alerts' },
  { href: '/scan', label: 'nav.scan' },
];

/** Посилання верхньої навігації на десктопі (Figma: Navigation) */
export function NavLinks() {
  const pathname = usePathname();
  const t = useT();
  return LINKS.map(({ href, label }) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(pathname, href) ? 'page' : undefined}
      className={`text-body-sm font-semibold ${isActive(pathname, href) ? 'text-brand' : 'text-fg-muted hover:text-fg'}`}
    >
      {t(label)}
    </Link>
  ));
}

/** Пошук у шапці: показує поточний запит каталогу */
export function HeaderSearch() {
  const params = useSearchParams();
  const filters = parseCatalogFilters(Object.fromEntries(params));
  return <SearchField key={filters.q} q={filters.q} filters={filters} />;
}

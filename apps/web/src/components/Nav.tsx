'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useT } from '@/i18n/client';
import type { MessageKey } from '@/i18n';
import { SearchField } from './SearchField';
import { BellIcon, GridIcon, HomeIcon, UserIcon } from './ui';

const TABS: { href: string; label: MessageKey; Icon: typeof HomeIcon }[] = [
  { href: '/', label: 'nav.home', Icon: HomeIcon },
  { href: '/products', label: 'nav.catalog', Icon: GridIcon },
  { href: '/alerts', label: 'nav.alerts', Icon: BellIcon },
  { href: '/profile', label: 'nav.profile', Icon: UserIcon },
];

/** Активна вкладка: Home — лише "/", решта — разом із вкладеними сторінками */
const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`) || (href === '/profile' && /^\/(settings|login)(\/|$)/.test(pathname));

/** Нижня навігація на телефоні (Figma: Tab bar); сканер — у полі пошуку */
export function TabBar() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-floating md:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 text-caption font-semibold transition-colors duration-(--duration-fast) ease-standard ${active ? 'text-brand' : 'text-fg-muted'}`}
          >
            {/* Нова вкладка: іконка «вискакує» 0,9 → 1 (клас з'являється лише в момент переходу) */}
            <Icon width={24} height={24} className={active ? 'pop-in' : undefined} />
            {t(label)}
          </Link>
        );
      })}
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
  const q = useSearchParams().get('q') ?? undefined;
  return <SearchField key={q} q={q} />;
}

'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SearchField } from './SearchField';
import { BellIcon, GridIcon, HomeIcon, UserIcon } from './ui';

const TABS = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/products', label: 'Catalog', Icon: GridIcon },
  { href: '/alerts', label: 'Alerts', Icon: BellIcon },
  { href: '/profile', label: 'Profile', Icon: UserIcon },
];

/** Активна вкладка: Home — лише "/", решта — разом із вкладеними сторінками */
const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`) || (href === '/profile' && ['/settings', '/login'].includes(pathname));

/** Нижня навігація на телефоні (Figma: Tab bar); сканер — у полі пошуку */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-floating md:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 text-caption font-semibold ${active ? 'text-brand' : 'text-fg-muted'}`}
          >
            <Icon width={24} height={24} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

const LINKS = [
  { href: '/products', label: 'Catalog' },
  { href: '/alerts', label: 'Alerts' },
  { href: '/scan', label: 'Scan' },
];

/** Посилання верхньої навігації на десктопі (Figma: Navigation) */
export function NavLinks() {
  const pathname = usePathname();
  return LINKS.map(({ href, label }) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(pathname, href) ? 'page' : undefined}
      className={`text-body-sm font-semibold ${isActive(pathname, href) ? 'text-brand' : 'text-fg-muted hover:text-fg'}`}
    >
      {label}
    </Link>
  ));
}

/** Пошук у шапці: показує поточний запит каталогу */
export function HeaderSearch() {
  const q = useSearchParams().get('q') ?? undefined;
  return <SearchField key={q} q={q} />;
}

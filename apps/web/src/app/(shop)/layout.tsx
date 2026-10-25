import Link from 'next/link';
import { Suspense } from 'react';
import { HeaderSearch, NavLinks, TabBar } from '@/components/Nav';
import { BellIcon } from '@/components/ui';
import { getT } from '@/i18n/server';
import { currentUser } from '@/lib/session';

/** Вітрина для покупців (Figma: Screens): шапка на десктопі, таб-бар на телефоні. Службова частина — /admin */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [user, t] = await Promise.all([currentUser(), getT()]);
  return (
    <>
      <header className="hidden border-b border-line bg-surface md:block">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-title-sm font-bold">
            <span className="grid size-8 place-items-center rounded-sm bg-brand text-white">O</span>
            OnniMart
          </Link>
          <NavLinks />
          <div className="flex-1">
            <Suspense>
              <HeaderSearch />
            </Suspense>
          </div>
          <Link href="/alerts" aria-label={t('nav.alerts')} className="text-icon hover:text-brand">
            <BellIcon width={22} height={22} />
          </Link>
          {user ? (
            <Link
              href="/profile"
              aria-label={t('nav.profile')}
              className="grid size-10 place-items-center rounded-full bg-brand text-body font-bold text-white"
            >
              {(user.name ?? user.email).charAt(0).toUpperCase()}
            </Link>
          ) : (
            <Link href="/login" className="rounded-md bg-brand px-4 py-2.5 text-body-sm font-semibold text-white hover:opacity-90">
              {t('nav.signIn')}
            </Link>
          )}
        </nav>
      </header>
      {/* Знизу місце під таб-бар на телефоні */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:pb-6">{children}</main>
      <TabBar />
    </>
  );
}

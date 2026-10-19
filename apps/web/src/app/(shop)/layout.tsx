import Link from 'next/link';
import { currentUser } from '@/lib/session';

const nav = 'text-body-sm font-semibold text-fg-muted hover:text-fg';

/** Вітрина для покупців (Figma: Screens). Службова частина — /admin */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <>
      <header className="border-b border-line bg-surface">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-title-sm font-bold">
            <span className="grid size-8 place-items-center rounded-sm bg-brand text-white">O</span>
            OnniMart
          </Link>
          <Link href="/products" className={nav}>Catalog</Link>
          <Link href="/scan" className={nav}>Scan</Link>
          <Link href="/alerts" className={nav}>Alerts</Link>
          <Link href={user ? '/profile' : '/login'} className={`${nav} ml-auto`}>
            {user ? (user.name ?? 'Profile') : 'Sign in'}
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}

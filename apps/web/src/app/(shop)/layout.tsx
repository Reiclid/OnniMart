import Link from 'next/link';

/** Вітрина для покупців (Figma: Screens). Службова частина — /admin */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-title-sm font-bold">
            <span className="grid size-8 place-items-center rounded-sm bg-brand text-white">O</span>
            OnniMart
          </Link>
          <Link href="/products" className="text-body-sm font-semibold text-fg-muted hover:text-fg">
            Catalog
          </Link>
          <Link href="/scan" className="text-body-sm font-semibold text-fg-muted hover:text-fg">
            Scan
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}

import Link from "next/link";

const NAV = [
  { href: "/admin", label: "Огляд" },
  { href: "/admin/products", label: "Каталог" },
  { href: "/admin/listings", label: "Картки мереж" },
  { href: "/admin/matching", label: "Зіставлення" },
  { href: "/admin/barcodes", label: "Штрихкоди OFF" },
  { href: "/admin/decisions", label: "Рішення" },
];

/** Службова частина: перевірка даних, запуск парсера, модерація зіставлень */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div lang="uk" className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <Link href="/admin" className="text-lg font-bold text-slate-900">
            OnniMart · admin
          </Link>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-slate-600 hover:text-slate-900">
              {item.label}
            </Link>
          ))}
          <Link href="/" className="ml-auto text-sm text-slate-500 hover:text-slate-900">
            Сайт
          </Link>
          <a
            href={`${process.env.API_URL ?? "http://localhost:3001"}/api/docs`}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            API docs
          </a>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

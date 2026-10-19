import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "OnniMart — моніторинг цін",
  description: "Перевірка зібраних даних: мережі, запуски парсера, ціни",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="uk"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-lg font-bold text-slate-900">
              OnniMart
            </Link>
            <Link
              href="/"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Огляд
            </Link>
            <Link
              href="/products"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Каталог
            </Link>
            <Link
              href="/listings"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Картки мереж
            </Link>
            <Link
              href="/matching"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Зіставлення
            </Link>
            <a
              href={`${process.env.API_URL ?? "http://localhost:3001"}/api/docs`}
              className="ml-auto text-sm text-slate-500 hover:text-slate-900"
            >
              API docs
            </a>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}

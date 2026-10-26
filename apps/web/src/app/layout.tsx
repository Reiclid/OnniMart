import type { Metadata } from "next";
import localFont from "next/font/local";
import { I18nProvider } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import "./globals.css";

// Шрифт лежить у репозиторії (OFL, fonts/Inter-LICENSE.txt): збірка не залежить від Google Fonts
const inter = localFont({ src: "./fonts/InterVariable.woff2", variable: "--font-inter", weight: "100 900" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("meta.title"), description: t("meta.description") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale } = await getI18n();
  return (
    <html lang={locale} className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Без JS фото не дочекаються decode() — показуємо одразу */}
        <noscript>
          <style>{'.photo{opacity:1!important}'}</style>
        </noscript>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}

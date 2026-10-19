import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Шрифт лежить у репозиторії (OFL, fonts/Inter-LICENSE.txt): збірка не залежить від Google Fonts
const inter = localFont({ src: "./fonts/InterVariable.woff2", variable: "--font-inter", weight: "100 900" });

export const metadata: Metadata = {
  title: "OnniMart — compare grocery prices",
  description: "Where is it cheapest right now: prices of one product in every chain",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

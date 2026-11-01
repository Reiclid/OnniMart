import type { NextConfig } from "next";
import { IMAGE_HOSTS } from "./src/lib/images";

const nextConfig: NextConfig = {
  // Тунель для телефона (bun run share): dev-сервер інакше блокує HMR і dev-ресурси з чужого хоста
  allowedDevOrigins: ["*.trycloudflare.com"],
  images: {
    // Фото мереж (src/lib/images.ts): стиснені WebP з нашого домену замість оригіналів з десятка чужих
    remotePatterns: IMAGE_HOSTS.map((hostname) => ({ hostname })),
    formats: ["image/webp"],
    // Фото товарів майже не змінюються: місяць у кеші сервера (прогрів — bun run images:warm);
    // застаріла копія віддається одразу й оновлюється у фоні
    minimumCacheTTL: 31 * 24 * 60 * 60,
  },
  // Service worker push-сповіщень: браузер має бачити нову версію одразу
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;

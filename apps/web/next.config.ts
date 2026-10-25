import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Тунель для телефона (bun run share): dev-сервер інакше блокує HMR і dev-ресурси з чужого хоста
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;

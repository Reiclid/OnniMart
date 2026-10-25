// Публічне посилання на локальний сайт (для телефона поза цією мережею): безкоштовний
// тунель Cloudflare, без акаунта. Адреса *.trycloudflare.com нова при кожному запуску —
// cloudflared друкує її в рамці. Назовні видно лише сайт (:3000); API, Redis і база — ні,
// адмінка без ADMIN_WEB_PASSWORD закрита (src/lib/admin-access.ts).
//   bun run share            (сайт уже запущено: bun run dev:web або next start)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const installed = join(homedir(), '.cloudflared', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const bin = process.env.CLOUDFLARED ?? (existsSync(installed) ? installed : 'cloudflared');
const port = process.env.PORT ?? '3000';

spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { stdio: 'inherit' })
  .on('error', () => {
    console.error(`cloudflared не знайдено (${bin}). Встановіть його або задайте CLOUDFLARED=<шлях>`);
    process.exit(1);
  })
  .on('exit', (code) => process.exit(code ?? 0));

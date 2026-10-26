// Публічне посилання на сайт (для телефона поза цією мережею): безкоштовний тунель Cloudflare,
// без акаунта. Адреса *.trycloudflare.com нова при кожному запуску — cloudflared друкує її в рамці.
// Назовні видно лише сайт; API, Redis і база — ні, адмінка без ADMIN_WEB_PASSWORD закрита
// (src/lib/admin-access.ts).
//   bun run share            production: next build → next start на :3100 (SHARE_PORT) → тунель.
//                            Швидко й без dev-кнопки Next; API (:3001) має бути запущено
//   bun run share -- --dev   тунель до вже запущеного dev-сервера (:3000, PORT) — з гарячим оновленням
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const installed = join(homedir(), '.cloudflared', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const bin = process.env.CLOUDFLARED ?? (existsSync(installed) ? installed : 'cloudflared');
const dev = process.argv.includes('--dev');
const port = dev ? (process.env.PORT ?? '3000') : (process.env.SHARE_PORT ?? '3100');
const web = fileURLToPath(new URL('..', import.meta.url));
// Сам Next без обгорток shell / bun run: kill() на виході зупиняє саме його (Windows)
const next = (...args: string[]) => [join(web, 'node_modules', 'next', 'dist', 'bin', 'next'), ...args];
const children: ChildProcess[] = [];
const stop = (code = 0) => {
  for (const child of children) child.kill();
  process.exit(code);
};
process.on('SIGINT', () => stop());

if (!dev) {
  console.log('Збираю production (next build)…');
  if (spawnSync(process.execPath, next('build'), { cwd: web, stdio: 'inherit' }).status !== 0) stop(1);
  children.push(spawn(process.execPath, next('start', '--port', port), { cwd: web, stdio: 'inherit' }));
  // Тунель — коли сайт уже відповідає, інакше перші відвідувачі побачать помилку Cloudflare
  for (let i = 0; ; i++) {
    if (await fetch(`http://localhost:${port}`, { redirect: 'manual' }).then(() => true, () => false)) break;
    if (i > 60) {
      console.error(`next start не відповідає на :${port}`);
      stop(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const tunnel = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { stdio: 'inherit' });
children.push(tunnel);
tunnel
  .on('error', () => {
    console.error(`cloudflared не знайдено (${bin}). Встановіть його або задайте CLOUDFLARED=<шлях>`);
    stop(1);
  })
  .on('exit', (code) => stop(code ?? 0));

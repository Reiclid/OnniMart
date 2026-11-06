// Публічне посилання на сайт (для телефона поза цією мережею): безкоштовний тунель Cloudflare,
// без акаунта. Адреса *.trycloudflare.com нова при кожному запуску: друкуємо її в рамці й копіюємо в буфер.
// Назовні видно лише сайт; API, Redis і база — ні, адмінка без ADMIN_WEB_PASSWORD закрита
// (src/lib/admin-access.ts).
//   bun run share            production: next build → next start на :3100 (SHARE_PORT) → тунель.
//                            Швидко й без dev-кнопки Next; API (:3001) має бути запущено
//   bun run share -- --dev   тунель до вже запущеного dev-сервера (:3000, PORT) — з гарячим оновленням
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
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
  // Типи, які колись лишив next dev, можуть посилатися на вже видалені сторінки — і next build падає на
  // перевірці типів (tsconfig включає .next/dev/types). next dev створить їх заново
  rmSync(join(web, '.next', 'dev', 'types'), { recursive: true, force: true });
  // --webpack, як і dev: Turbopack запускає PostCSS окремим процесом `node`, а тут лише bun
  if (spawnSync(process.execPath, next('build', '--webpack'), { cwd: web, stdio: 'inherit' }).status !== 0) stop(1);
  children.push(spawn(process.execPath, next('start', '--hostname', '127.0.0.1', '--port', port), { cwd: web, stdio: 'inherit' }));
  // Тунель — коли сайт уже відповідає, інакше перші відвідувачі побачать помилку Cloudflare
  for (let i = 0; ; i++) {
    if (await fetch(`http://127.0.0.1:${port}`, { redirect: 'manual' }).then(() => true, () => false)) break;
    if (i > 60) {
      console.error(`next start не відповідає на :${port}`);
      stop(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// Лог cloudflared ховаємо: з нього потрібна лише адреса — її друкуємо великою рамкою й кладемо в буфер обміну.
// Якщо тунель впав до появи адреси — показуємо весь лог
const tunnel = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(tunnel);
let log = '';
let url: string | undefined;
const scan = (chunk: Buffer) => {
  if (url) return;
  log += chunk.toString();
  url = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (url) announce(url);
};
tunnel.stdout.on('data', scan);
tunnel.stderr.on('data', scan);
tunnel
  .on('error', () => {
    console.error(`cloudflared не знайдено (${bin}). Встановіть його або задайте CLOUDFLARED=<шлях>`);
    stop(1);
  })
  .on('exit', (code) => {
    if (!url) console.error(log);
    stop(code ?? 0);
  });

function announce(address: string) {
  const copied = copy(address);
  const lines = [
    'OnniMart відкрито в інтернеті:',
    '',
    address,
    '',
    copied ? 'Адресу скопійовано в буфер обміну.' : 'Виділіть адресу й скопіюйте.',
    'Нова адреса при кожному запуску. Ctrl+C — зупинити.',
  ];
  const width = Math.max(...lines.map((line) => line.length)) + 4;
  const row = (line: string) => `║  ${line.padEnd(width - 4)}  ║`;
  console.log(['', `╔${'═'.repeat(width)}╗`, ...lines.map(row), `╚${'═'.repeat(width)}╝`, ''].join('\n'));
}

function copy(text: string) {
  const command = process.platform === 'win32' ? 'clip' : process.platform === 'darwin' ? 'pbcopy' : undefined;
  return command !== undefined && spawnSync(command, { input: text }).status === 0;
}

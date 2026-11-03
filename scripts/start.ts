// Увесь OnniMart однією командою: `bun start` у корені або подвійний клік по start.cmd.
//   1. Docker: запускає Docker Desktop, якщо вимкнений, → postgres, redis, meilisearch, scraper
//   2. міграції бази (prisma migrate deploy — лише застосовує нові, нічого не стирає)
//   3. API :3001 і worker; їхні логи — у logs/api.log, logs/worker.log. Уже запущений API не чіпаємо,
//      другий worker сам вийде (WorkerLock)
//   4. сайт (production) і тунель Cloudflare — apps/web/scripts/share.ts друкує публічну адресу в рамці
// Ctrl+C зупиняє все, що запустив цей скрипт; контейнери лишаються (`bun run infra:down`).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const api = join(root, 'apps', 'api');
const logs = join(root, 'logs');
const children: ChildProcess[] = [];
const stop = (code = 0) => {
  for (const child of children) child.kill();
  process.exit(code);
};
process.on('SIGINT', () => stop());

const run = (title: string, command: string, args: string[], cwd = root) => {
  console.log(`▸ ${title}`);
  if (spawnSync(command, args, { cwd, stdio: 'inherit' }).status !== 0) {
    console.error(`✗ ${title} — не вдалося`);
    stop(1);
  }
};
const until = async (check: () => boolean | Promise<boolean>, seconds: number) => {
  for (let i = 0; i < seconds * 2; i++) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
};
const dockerReady = () => spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
const apiReady = () =>
  fetch('http://localhost:3001/api/v1/health').then(
    (res) => res.ok,
    () => false,
  );

if (!dockerReady()) {
  const desktop = [
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'Docker Desktop.exe'),
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe'),
  ].find(existsSync);
  if (!desktop) {
    console.error('Docker не запущено і Docker Desktop не знайдено. Запустіть Docker вручну.');
    stop(1);
  }
  console.log('▸ Запускаю Docker Desktop (до 3 хв)…');
  spawn(desktop!, [], { detached: true, stdio: 'ignore' }).unref();
  if (!(await until(dockerReady, 180))) {
    console.error('Docker так і не відповів за 3 хв');
    stop(1);
  }
}

run('Контейнери: postgres, redis, meilisearch, scraper', 'docker', [
  'compose', 'up', '-d', '--wait', 'postgres', 'redis', 'meilisearch', 'scraper',
]);
run('Міграції бази', 'bun', ['x', 'prisma', 'migrate', 'deploy'], api);
run('Збірка пакетів (@repo/*)', 'bun', ['run', 'build:packages']);

mkdirSync(logs, { recursive: true });
const background = (name: string, entry: string) => {
  const out = openSync(join(logs, `${name}.log`), 'a');
  children.push(spawn('bun', [entry], { cwd: api, stdio: ['ignore', out, out] }));
};
if (await apiReady()) {
  console.log('▸ API уже працює на :3001 — використовую його');
} else {
  console.log('▸ API :3001 (лог: logs/api.log)');
  background('api', 'src/main.ts');
  if (!(await until(apiReady, 90))) {
    console.error('API не відповів за 90 с — дивіться logs/api.log');
    stop(1);
  }
}
console.log('▸ Worker (лог: logs/worker.log)');
background('worker', 'src/worker.ts');

const share = spawn('bun', [join('apps', 'web', 'scripts', 'share.ts')], { cwd: root, stdio: 'inherit' });
children.push(share);
share.on('exit', (code) => stop(code ?? 0));

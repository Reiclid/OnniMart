// Бюджети продуктивності (PRD-22): відгук на дотик, клієнтська навігація, LCP, CLS і p95 API.
// Міряє production-збірку у встановленому Chrome (playwright-core, браузер не завантажується).
// Результат пишеться в .perf/last.json; наступний запуск показує різницю з попереднім.
// Код виходу 1, якщо бюджет перевищено.
//   API на :3001, сайт: cd apps/web && bun run build && bun run start
//   bun run perf                (PERF_CHANNEL=msedge — Edge замість Chrome)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:3001';
const ROUNDS = 3; // разом із запитами до API — у межах 120 запитів/хв throttler'а
const API_SAMPLES = 20;

const BUDGETS = {
  tapMs: 100, // найдовша подія pointer/click до наступного кадру (Event Timing)
  navigationP75Ms: 300, // клік → URL змінився → кадр намальовано
  lcpMs: 2000,
  cls: 0.05,
  apiP95Ms: 150,
};
type Results = Record<string, number>;

const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
};

// Спостерігачі ставляться до завантаження сторінки й живуть між клієнтськими переходами
const OBSERVERS = () => {
  const perf = { tap: 0, lcp: 0, cls: 0 };
  Object.assign(window, { __perf: perf });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      if (['pointerdown', 'pointerup', 'click'].includes(e.name)) perf.tap = Math.max(perf.tap, e.duration);
  }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) perf.lcp = Math.max(perf.lcp, e.startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
      if (!e.hadRecentInput) perf.cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
};
const readObservers = (page: Page) =>
  page.evaluate(() => (window as unknown as { __perf: { tap: number; lcp: number; cls: number } }).__perf);
const nextFrame = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function navigate(page: Page, go: () => Promise<unknown>) {
  const from = page.url();
  const started = performance.now();
  await go();
  await page.waitForURL((url) => url.href !== from);
  await nextFrame(page);
  return performance.now() - started;
}

async function measureWeb(): Promise<Results> {
  const browser = await chromium.launch({ channel: process.env.PERF_CHANNEL ?? 'chrome' });
  // Телефон: більшість користувачів відкриває сайт з мобільного (docs/05-user-research.md)
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript(OBSERVERS);
  const results: Results = {};
  const navigations: Record<string, number[]> = {};
  const record = (name: string, ms: number) => (navigations[name] ??= []).push(ms);
  const link = (selector: string) => page.locator(`${selector}:visible`).first();

  await page.goto(WEB, { waitUntil: 'networkidle' });
  for (let round = 0; round < ROUNDS; round++) {
    record('home→catalog', await navigate(page, () => link('nav a[href="/products"]').tap()));
    await page.waitForLoadState('networkidle');
    record('catalog→product', await navigate(page, () => link('main a[href^="/products/"]').tap()));
    await page.waitForLoadState('networkidle');
    record('product→back', await navigate(page, () => page.goBack()));
    record('catalog→alerts', await navigate(page, () => link('nav a[href="/alerts"]').tap()));
    record('alerts→profile', await navigate(page, () => link('nav a[href="/profile"]').tap()));
    record('profile→home', await navigate(page, () => link('nav a[href="/"]').tap()));
    await page.waitForLoadState('networkidle');
  }
  for (const [name, values] of Object.entries(navigations)) results[`nav ${name} p75`] = quantile(values, 0.75);
  results.tap = (await readObservers(page)).tap;

  // LCP і CLS — на холодному завантаженні сторінок, які відкривають найчастіше
  const product = await link('main a[href^="/products/"]').getAttribute('href');
  for (const path of ['/', '/products', product!]) {
    const cold = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await cold.addInitScript(OBSERVERS);
    await cold.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
    await cold.mouse.move(1, 1); // LCP фіксується до першого вводу
    const { lcp, cls } = await readObservers(cold);
    const name = path.startsWith('/products/') ? '/products/[id]' : path;
    results[`lcp ${name}`] = lcp;
    results[`cls ${name}`] = cls;
    await cold.close();
  }
  await browser.close();
  return results;
}

async function measureApi(): Promise<Results> {
  const time = async (path: string) => {
    const started = performance.now();
    const response = await fetch(`${API}${path}`);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    await response.arrayBuffer();
    return performance.now() - started;
  };
  const { items } = (await (await fetch(`${API}/api/v1/products?pageSize=1`)).json()) as { items: { id: string }[] };
  const paths = {
    catalog: '/api/v1/products?pageSize=24',
    search: '/api/v1/products?q=milch&pageSize=24',
    product: `/api/v1/products/${items[0].id}`,
  };
  const results: Results = {};
  for (const [name, path] of Object.entries(paths)) {
    await time(path); // прогрів: кеші Prisma і Meilisearch
    const samples: number[] = [];
    for (let i = 0; i < API_SAMPLES; i++) samples.push(await time(path));
    results[`api ${name} p95`] = quantile(samples, 0.95);
  }
  return results;
}

const budgetOf = (name: string) =>
  name === 'tap'
    ? BUDGETS.tapMs
    : name.startsWith('nav ')
      ? BUDGETS.navigationP75Ms
      : name.startsWith('lcp ')
        ? BUDGETS.lcpMs
        : name.startsWith('cls ')
          ? BUDGETS.cls
          : BUDGETS.apiP95Ms;

const results = { ...(await measureApi()), ...(await measureWeb()) };
let previous: Results = {};
try {
  previous = JSON.parse(readFileSync('.perf/last.json', 'utf8')) as Results;
} catch {
  // перший запуск — порівнювати нема з чим
}
mkdirSync('.perf', { recursive: true });
writeFileSync('.perf/last.json', JSON.stringify(results, null, 2));

const format = (name: string, value: number) => (name.startsWith('cls ') ? value.toFixed(3) : `${Math.round(value)} мс`);
let failed = 0;
for (const [name, value] of Object.entries(results)) {
  const budget = budgetOf(name);
  const over = value > budget;
  if (over) failed++;
  const delta = previous[name] === undefined ? '' : ` (було ${format(name, previous[name])})`;
  console.log(`${over ? '✗' : '✓'} ${name.padEnd(26)} ${format(name, value).padStart(8)} / ${format(name, budget)}${delta}`);
}
console.log(failed ? `\nПеревищено бюджетів: ${failed}` : '\nУсі бюджети дотримано');
process.exit(failed ? 1 : 0);

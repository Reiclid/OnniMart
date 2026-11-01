// Прогрів кешу фото: оптимізатор Next на першому запиті тягне оригінал із сайту мережі й стискає
// його (80–500 мс на фото, а сторінка з 20 нових фото вантажиться сходинками до 3–4 с); з кешу —
// 3–4 мс. Скрипт заздалегідь запитує копію кожного фото каталогу (photoUrl — той самий ключ, що й
// у ProductImage), тож покупець отримує фото з кешу одразу.
//   bun run images:warm        веб :3000 (WEB_URL), API :3001 (API_URL); веб і API мають працювати
// Промах тягне оригінал із домену мережі, тому на кожен домен — один запит за раз і пауза 3 с
// після промаху (AGENTS §5.1); фото, що вже в кеші, пауз не мають. Повторний запуск дешевий.
import { optimizable, photoUrl } from '../src/lib/images';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:3001';
const DELAY_MS = 3000;
const PAGE_SIZE = 200;

/** Фото всіх товарів каталогу — у порядку API (спершу ті, що в більшій кількості мереж) */
async function imageUrls(): Promise<string[]> {
  const urls = new Set<string>();
  for (let page = 1; ; page++) {
    const response = await fetch(`${API}/api/v1/products?page=${page}&pageSize=${PAGE_SIZE}`);
    if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
    const { items } = (await response.json()) as { items: { imageUrl: string | null }[] };
    for (const item of items) if (item.imageUrl && optimizable(item.imageUrl)) urls.add(item.imageUrl);
    if (items.length < PAGE_SIZE) return [...urls];
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const counts = { HIT: 0, MISS: 0, error: 0 };
let done = 0;

async function warmHost(urls: string[], total: number) {
  for (const src of urls) {
    try {
      // Accept — як у браузера: від нього залежить формат копії, а отже й ключ кешу
      const response = await fetch(`${WEB}${photoUrl(src)}`, { headers: { Accept: 'image/webp,image/*,*/*;q=0.8' } });
      await response.arrayBuffer();
      const cache = response.headers.get('x-nextjs-cache');
      if (!response.ok) counts.error++;
      else if (cache === 'HIT') counts.HIT++;
      else counts.MISS++;
      if (cache !== 'HIT') await sleep(DELAY_MS);
    } catch {
      counts.error++;
      await sleep(DELAY_MS);
    }
    if (++done % 200 === 0 || done === total)
      console.log(`${done}/${total} · з кешу ${counts.HIT} · нових ${counts.MISS} · помилок ${counts.error}`);
  }
}

async function main() {
  const urls = await imageUrls();
  const byHost = new Map<string, string[]>();
  for (const src of urls) {
    const host = new URL(src).hostname;
    byHost.set(host, [...(byHost.get(host) ?? []), src]);
  }
  console.log(`Фото: ${urls.length} з ${byHost.size} доменів → ${WEB}`);
  // Домени паралельно, усередині домену — по одному
  await Promise.all([...byHost.values()].map((list) => warmHost(list, urls.length)));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

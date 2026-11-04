// PRD-33: dHash фото, щоб галерея не показувала те саме фото виробника з кількох мереж.
// Хешуємо лише товари з кількома різними фото; вже пораховані пропускаємо, тож повторний запуск
// продовжує з місця зупинки, а збій окремого фото просто лишає його без хешу.
//   bun run images:hash                      # усі (десятки годин: див. паузу нижче)
//   bun run images:hash -- --limit 200       # спершу товари з найбільшою кількістю мереж
//   bun run images:hash -- --product <id>    # один товар
// Оригінал тягнеться із домену мережі, тому на домен — один запит за раз і пауза 3 с (AGENTS §5.1),
// домени паралельно. Без підміни User-Agent.
import sharp from 'sharp';
import {
  dHash,
  distinctImages,
  imageKey,
} from '../src/modules/catalog/product-images';
import { PrismaService } from '../src/prisma/prisma.service';

const DELAY_MS = 3000;
const USER_AGENT = 'OnniMart/1.0 (image dedup)';

const flag = (name: string) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};
const limit = Number(flag('--limit') ?? 0);
const productId = flag('--product');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Фото без хешу: одна адреса на файл, у порядку популярності товару */
async function pendingUrls(prisma: PrismaService): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ productId: string; url: string }[]>`
    WITH photos AS (
      SELECT v."productId", l."imageUrl" AS url, l."chainId"
      FROM listings l JOIN product_variants v ON v.id = l."variantId"
      WHERE l."delistedAt" IS NULL AND l."imageUrl" IS NOT NULL
        AND (${productId ?? null}::text IS NULL OR v."productId" = ${productId ?? null})
    ), ranked AS (
      SELECT "productId", count(DISTINCT "chainId") AS chains
      FROM photos GROUP BY 1 HAVING count(DISTINCT url) > 1
    )
    SELECT DISTINCT p."productId", p.url, r.chains
    FROM photos p JOIN ranked r USING ("productId")
    ORDER BY r.chains DESC, p."productId"`;
  // Товар із самими дзеркалами (img2/img3) хешувати нема потреби
  const byProduct = new Map<string, string[]>();
  for (const { productId: id, url } of rows)
    byProduct.set(id, [...(byProduct.get(id) ?? []), url]);
  const known = new Set(
    (await prisma.imageHash.findMany({ select: { key: true } })).map(
      (row) => row.key,
    ),
  );
  const pending = new Map<string, string>();
  for (const urls of byProduct.values()) {
    const distinct = distinctImages(urls, undefined, urls.length);
    if (distinct.length < 2) continue;
    for (const url of distinct)
      if (!known.has(imageKey(url))) pending.set(imageKey(url), url);
  }
  const urls = [...pending.values()];
  return limit > 0 ? urls.slice(0, limit) : urls;
}

async function hash(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${response.status}`);
  const pixels = await sharp(Buffer.from(await response.arrayBuffer()))
    .flatten({ background: '#ffffff' })
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();
  return dHash(pixels);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const urls = await pendingUrls(prisma);
  const byHost = new Map<string, string[]>();
  for (const url of urls) {
    const host = new URL(url).hostname.replace(/^img\d+\./, '');
    byHost.set(host, [...(byHost.get(host) ?? []), url]);
  }
  console.log(`Фото без хешу: ${urls.length} із ${byHost.size} доменів`);

  let done = 0;
  let failed = 0;
  await Promise.all(
    [...byHost.values()].map(async (list) => {
      for (const url of list) {
        try {
          const key = imageKey(url);
          const value = await hash(url);
          await prisma.imageHash.upsert({
            where: { key },
            create: { key, hash: value },
            update: { hash: value },
          });
        } catch (error) {
          failed++;
          console.warn(
            `${url}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (++done % 100 === 0)
          console.log(`${done}/${urls.length} · помилок ${failed}`);
        await sleep(DELAY_MS);
      }
    }),
  );
  console.log(`Готово: ${done - failed}, помилок ${failed}`);
  await prisma.$disconnect();
}

void main();

// Склад і харчова цінність з Open Food Facts → food_facts, для наших штрихкодів.
// CSV-вивантаження (≈ 1,5 ГБ gzip, ODbL) читається потоком: на диск нічого не пишеться.
// Оновлення — раз на тиждень (OFF перевидає файл щодня).
//   bun run food:import                   # з static.openfoodfacts.org
//   bun run food:import -- off.csv.gz     # з локального файлу
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import { normalizeGtin } from '@repo/matching';
import { PrismaService } from '../src/prisma/prisma.service';
import { saveFoodFacts } from '../src/modules/catalog/food-facts.store';
import {
  columnIndex,
  parseOffRow,
  type FoodFactsRow,
} from '../src/modules/catalog/food-facts';

const URL =
  'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';
const USER_AGENT = 'OnniMartBot/0.1 (diploma project; reiclid@gmail.com)';

async function source(file: string | undefined): Promise<Readable> {
  if (file) return createReadStream(file);
  const response = await fetch(URL, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok || !response.body)
    throw new Error(`OFF: HTTP ${response.status}`);
  return Readable.fromWeb(response.body as WebReadableStream);
}

async function main() {
  const prisma = new PrismaService();
  const wanted = new Set(
    (await prisma.barcode.findMany({ select: { gtin: true } })).map(
      (b) => b.gtin,
    ),
  );
  console.log(`Наших штрихкодів: ${wanted.size}`);

  const started = Date.now();
  const lines = createInterface({
    input: (await source(process.argv[2])).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let columns: Map<string, number> | null = null;
  let scanned = 0;
  const found = new Map<string, FoodFactsRow>();
  for await (const line of lines) {
    if (!columns) {
      columns = columnIndex(line);
      continue;
    }
    if (++scanned % 500_000 === 0) {
      console.log(
        `  ${scanned / 1000} тис. рядків, знайдено ${found.size}, ${Math.round((Date.now() - started) / 1000)} с`,
      );
    }
    // Швидкий відсів за кодом (перший стовпець), повний розбір — лише для наших
    const code = normalizeGtin(line.slice(0, line.indexOf('\t')));
    if (!code || !wanted.has(code)) continue;
    const row = parseOffRow(line, columns, wanted);
    if (row) found.set(row.gtin, row);
  }

  await saveFoodFacts(prisma, [...found.values()]);
  const withNutri = [...found.values()].filter((r) => r.nutriscore).length;
  const withIngredients = [...found.values()].filter(
    (r) => r.ingredients,
  ).length;
  console.log(
    `Готово за ${Math.round((Date.now() - started) / 60_000)} хв: ${scanned} рядків OFF, ` +
      `знайдено ${found.size} з ${wanted.size} (${Math.round((found.size / Math.max(1, wanted.size)) * 100)} %), ` +
      `склад — ${withIngredients}, Nutri-Score — ${withNutri}`,
  );
  await prisma.$disconnect();
}

void main();

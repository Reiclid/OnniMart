// Покриття понять (PRD-19): частка товарів із conceptOf за категоріями каталогу. Лише читає БД.
//   bun run concept:coverage
//   bun run concept:coverage -- --samples 15   (приклади назв без поняття, за категорією)
import 'dotenv/config';
import { conceptOf } from '@repo/matching';
import { PrismaService } from '../src/prisma/prisma.service';

const arg = process.argv.indexOf('--samples');
const samples = arg > 0 ? Number(process.argv[arg + 1]) || 10 : 0;

async function main() {
  const prisma = new PrismaService();
  try {
    const products = await prisma.product.findMany({
      select: { name: true, category: { select: { slug: true } } },
    });
    const by = new Map<
      string,
      { all: number; hit: number; misses: string[] }
    >();
    for (const p of products) {
      const slug = p.category?.slug ?? '(без категорії)';
      const row = by.get(slug) ?? { all: 0, hit: 0, misses: [] };
      row.all++;
      if (conceptOf(p.name, p.category?.slug)) row.hit++;
      else if (samples && row.misses.length < 4000) row.misses.push(p.name);
      by.set(slug, row);
    }
    console.log('категорія                 товарів  з поняттям');
    let all = 0;
    let hit = 0;
    for (const [slug, r] of [...by].sort((a, b) => b[1].all - a[1].all)) {
      all += r.all;
      hit += r.hit;
      console.log(
        `${slug.padEnd(24)} ${String(r.all).padStart(8)} ${`${((r.hit / r.all) * 100).toFixed(0)} %`.padStart(10)}`,
      );
      if (samples)
        for (let i = 0; i < samples && i < r.misses.length; i++)
          console.log(
            `    - ${r.misses[Math.floor((i * r.misses.length) / samples)]}`,
          );
    }
    console.log(
      `\nУсього ${all}, з поняттям ${hit} (${((hit / all) * 100).toFixed(0)} %)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();

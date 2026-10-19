// Перебудова каталогу з нуля: видаляє товари, фасування, штрихкоди, лінійки
// й кандидатів зіставлення і скидає зіставлення всіх карток. Картки мереж та
// історія цін не змінюються. Рішення модератора (ACCEPTED / REJECTED) перед видаленням
// зберігаються в catalog-decisions-<дата>.json. Товари з підписками користувачів
// не видаляються (FK Restrict) — тоді скрипт зупиниться без змін.
//
// Запуск: bun scripts/reset-catalog.ts --yes, далі POST /api/v1/matching/run
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  if (!process.argv.includes('--yes')) {
    console.log(
      'Це видалить увесь каталог товарів. Повторіть з прапорцем --yes.',
    );
    return;
  }
  const decisions = await prisma.matchCandidate.findMany({
    where: { status: { in: ['ACCEPTED', 'REJECTED'] } },
    include: {
      listing: {
        select: {
          rawName: true,
          barcodes: true,
          chain: { select: { slug: true } },
        },
      },
      variant: {
        select: { label: true, product: { select: { name: true } } },
      },
    },
  });
  const file = `catalog-decisions-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify(decisions, null, 2));
  console.log(`Рішення модератора збережено: ${file} (${decisions.length})`);

  const [candidates, listings, products, lines] = await prisma.$transaction([
    prisma.matchCandidate.deleteMany(),
    prisma.listing.updateMany({
      data: {
        variantId: null,
        matchStatus: 'PENDING',
        matchMethod: null,
        matchScore: null,
        matchedAt: null,
      },
    }),
    // Фасування і штрихкоди видаляються каскадно разом з товарами
    prisma.product.deleteMany(),
    prisma.productLine.deleteMany(),
  ]);
  console.log(
    `Видалено товарів: ${products.count}, лінійок: ${lines.count}, кандидатів: ${candidates.count}; скинуто карток: ${listings.count}`,
  );
}

main()
  .catch((error: { code?: string }) => {
    // FK Restrict: на товари підписані користувачі — транзакцію відкочено
    console.error(
      error.code === 'P2003'
        ? 'Є підписки користувачів на товари каталогу — скидання скасовано, нічого не змінено'
        : error,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

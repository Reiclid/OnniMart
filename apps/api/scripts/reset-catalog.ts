// Перебудова каталогу з нуля: видаляє товари, фасування, штрихкоди, лінійки
// й кандидатів зіставлення і скидає зіставлення всіх карток. Картки мереж та
// історія цін не змінюються. Підтверджені модератором пари (ACCEPTED / REJECTED)
// теж зникають — тож використовуйте лише для експериментів з алгоритмом.
//
// Запуск: bun scripts/reset-catalog.ts --yes, далі POST /api/v1/matching/run
import 'dotenv/config';
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
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

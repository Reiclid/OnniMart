// Повна переіндексація Meilisearch без пакета зіставлення — після зміни полів пошуку
// (toSearchDoc / INDEX_SETTINGS). Воркер робить те саме після кожного пакета.
//
// Запуск: bun run search:reindex
import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchIndexer } from '../src/modules/catalog/search/search.indexer';

async function main() {
  const prisma = new PrismaService();
  try {
    const count = await new SearchIndexer(prisma).reindex();
    console.log(
      count
        ? `Проіндексовано товарів: ${count}`
        : 'MEILI_URL не задано — пошук через SQL',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();

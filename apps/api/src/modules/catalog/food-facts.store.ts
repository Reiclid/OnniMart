import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { FoodFactsRow } from './food-facts';

const BATCH = 500;

/** Запис у food_facts пачками; той самий для щотижневого CSV-імпорту й кешу сканера */
export async function saveFoodFacts(
  prisma: PrismaService,
  rows: FoodFactsRow[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows.slice(i, i + BATCH).map(
      (
        r,
      ) => Prisma.sql`(${r.gtin}, ${r.productName}, ${r.brands}::text[], ${r.quantity}, ${r.imageUrl},
          ${r.ingredients}, ${r.allergens}::text[], ${r.labels}::text[], ${r.categories}::text[], ${r.analysis}::text[],
          ${r.nutriments ? JSON.stringify(r.nutriments) : null}::jsonb, ${r.nutriscore}, ${r.nova}, ${r.offModifiedAt}, now())`,
    );
    await prisma.$executeRaw`
      INSERT INTO food_facts (gtin, "productName", brands, quantity, "imageUrl", ingredients, allergens, labels,
        categories, analysis, nutriments, nutriscore, nova, "offModifiedAt", "importedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT (gtin) DO UPDATE SET
        "productName" = EXCLUDED."productName", brands = EXCLUDED.brands, quantity = EXCLUDED.quantity,
        "imageUrl" = EXCLUDED."imageUrl", ingredients = EXCLUDED.ingredients, allergens = EXCLUDED.allergens,
        labels = EXCLUDED.labels, categories = EXCLUDED.categories, analysis = EXCLUDED.analysis,
        nutriments = EXCLUDED.nutriments, nutriscore = EXCLUDED.nutriscore, nova = EXCLUDED.nova,
        "offModifiedAt" = EXCLUDED."offModifiedAt", "importedAt" = now()`;
  }
}

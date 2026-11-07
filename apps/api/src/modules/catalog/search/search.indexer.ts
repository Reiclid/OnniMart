import { Injectable, Logger } from '@nestjs/common';
import { withFields } from '../../../logger';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  INDEX_SETTINGS,
  meili,
  PRODUCTS_INDEX,
  searchEnabled,
  toSearchDoc,
} from './search';

const BATCH = 1000;

/** Воркер: після пакета зіставлення переносить каталог в індекс Meilisearch */
@Injectable()
export class SearchIndexer {
  private readonly logger = new Logger(SearchIndexer.name);
  private configured = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * shortcut: повна переіндексація після кожного пакета (~9 тис. товарів, кілька секунд);
   * для мільйонів товарів — лише змінені.
   */
  async reindex(): Promise<number> {
    if (!searchEnabled()) return 0;
    const index = `/indexes/${PRODUCTS_INDEX}`;
    if (!this.configured) {
      // Оновлення налаштувань створює індекс, якщо його ще немає
      await meili(`${index}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(INDEX_SETTINGS),
      });
      this.configured = true;
    }
    const products = await this.prisma.product.findMany({
      select: {
        id: true,
        name: true,
        lineId: true,
        brand: { select: { name: true } },
        category: { select: { slug: true, name: true } },
        variants: {
          select: {
            label: true,
            barcodes: { select: { gtin: true } },
            listings: {
              where: { delistedAt: null },
              select: {
                currentPrice: true,
                isOnPromo: true,
                inStock: true,
                lastSeenAt: true,
                chain: {
                  select: { slug: true, currency: true, countryCode: true },
                },
              },
            },
          },
        },
      },
    });
    const indexedAt = Date.now();
    const docs = products.map((p) => toSearchDoc(p, indexedAt));
    for (let i = 0; i < docs.length; i += BATCH) {
      await meili(
        `${index}/documents?primaryKey=id`,
        { method: 'PUT', body: JSON.stringify(docs.slice(i, i + BATCH)) },
        30_000,
      );
    }
    // Товари, яких більше немає в каталозі
    await meili(`${index}/documents/delete`, {
      method: 'POST',
      body: JSON.stringify({ filter: `indexedAt < ${indexedAt}` }),
    });
    this.logger.log(
      withFields('Пошуковий індекс оновлено', { products: docs.length }),
    );
    return docs.length;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeBarcodes } from '../../catalog/normalization/gtin';
import {
  computeUnitPrice,
  ParsedQuantity,
  parseQuantity,
} from '../../catalog/normalization/quantity';
import { ScrapedProductDto } from '../dto/scraped-product.dto';

export type IngestResult = 'skipped' | 'unchanged' | 'changed';

/**
 * Зберігає товар, отриманий від парсера:
 *   1. upsert картки мережі (Listing) за (мережа, externalId);
 *   2. новий PriceSnapshot — лише якщо змінилась ціна / акція / наявність;
 *   3. автоматичне зіставлення з каталогом за штрихкодом.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(item: ScrapedProductDto): Promise<IngestResult> {
    if (!isValid(item)) {
      this.logger.warn(
        `Некоректне повідомлення від парсера: ${JSON.stringify(item)}`,
      );
      return 'skipped';
    }

    const chain = await this.prisma.storeChain.findUnique({
      where: { slug: item.store },
    });
    if (!chain) {
      this.logger.warn(`Невідома мережа "${item.store}" — додайте її в seed`);
      return 'skipped';
    }

    const quantity = resolveQuantity(item);
    const barcodes = normalizeBarcodes(item.barcodes ?? []);
    const price = item.price;
    const regularPrice =
      item.old_price != null && item.old_price > price ? item.old_price : null;
    const unitPrice = computeUnitPrice(price, quantity);
    const inStock = item.in_stock ?? true;
    const seenAt = parseDate(item.scraper_at);

    const key = { chainId: chain.id, externalId: item.external };
    const existing = await this.prisma.listing.findUnique({
      where: { chainId_externalId: key },
    });

    const changed =
      !existing ||
      Number(existing.currentPrice) !== price ||
      toNumberOrNull(existing.regularPrice) !== regularPrice ||
      existing.inStock !== inStock;

    const fields = {
      url: item.url ?? null,
      rawName: item.name,
      rawBrand: item.brand ?? null,
      rawCategory: item.category ?? null,
      imageUrl: item.image_url ?? null,
      barcodes,
      rawData: item as unknown as Prisma.InputJsonValue,
      measure: quantity?.measure ?? null,
      netQuantity: quantity?.netQuantity ?? null,
      packCount: quantity?.packCount ?? null,
      isWeighted: quantity?.isWeighted ?? false,
      currentPrice: price,
      regularPrice,
      unitPrice,
      isOnPromo: regularPrice !== null || Boolean(item.promo_label),
      inStock,
      lastSeenAt: seenAt,
    };

    const listing = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.listing.upsert({
        where: { chainId_externalId: key },
        create: { ...key, ...fields, firstSeenAt: seenAt },
        update: fields,
      });

      if (changed) {
        await tx.priceSnapshot.create({
          data: {
            listingId: saved.id,
            price,
            regularPrice,
            unitPrice,
            promoType: regularPrice !== null ? 'DISCOUNT' : null,
            promoLabel: item.promo_label ?? null,
            inStock,
            capturedAt: seenAt,
          },
        });
      }

      return saved;
    });

    if (!listing.variantId && barcodes.length > 0) {
      await this.matchByBarcode(listing.id, barcodes);
    }

    return changed ? 'changed' : 'unchanged';
  }

  /** Етап 1 зіставлення: точний збіг штрихкоду з уже відомим варіантом. */
  private async matchByBarcode(listingId: string, gtins: string[]) {
    const barcode = await this.prisma.barcode.findFirst({
      where: { gtin: { in: gtins } },
    });
    if (!barcode) return;

    await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        variantId: barcode.variantId,
        matchStatus: 'AUTO_MATCHED',
        matchMethod: 'BARCODE',
        matchScore: 1,
        matchedAt: new Date(),
      },
    });
  }
}

function isValid(item: ScrapedProductDto): boolean {
  return (
    typeof item?.store === 'string' &&
    typeof item.external === 'string' &&
    typeof item.name === 'string' &&
    item.name.trim().length > 0 &&
    typeof item.price === 'number' &&
    item.price > 0
  );
}

function resolveQuantity(item: ScrapedProductDto): ParsedQuantity | null {
  const unit = item.price_unit?.toLowerCase();
  if (unit === 'кг' || unit === 'kg') {
    return {
      measure: 'MASS',
      netQuantity: 1000,
      packCount: 1,
      isWeighted: true,
    };
  }
  return parseQuantity(item.name);
}

function parseDate(value: string): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

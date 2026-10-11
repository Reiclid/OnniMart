import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PromoType } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeBarcodes } from '../../catalog/normalization/gtin';
import {
  computeUnitPrice,
  ParsedQuantity,
  parseQuantity,
} from '../../catalog/normalization/quantity';
import { RunEventDto, ScrapedProductDto } from '../dto/scraped-product.dto';

export type IngestResult = 'skipped' | 'unchanged' | 'changed';

/**
 * Зберігає товар, отриманий від парсера:
 *   1. upsert картки мережі (Listing) за (мережа, externalId);
 *   2. новий PriceSnapshot — лише якщо змінилась ціна / акція / наявність;
 *   3. автоматичне зіставлення з каталогом за штрихкодом.
 * Також веде журнал запусків (ScrapeRun) за подіями від парсера.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  /** Кеш: чи існує ScrapeRun з таким id (щоб не перевіряти на кожен товар) */
  private readonly knownRuns = new Map<string, boolean>();

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
    const isOnPromo = regularPrice !== null || Boolean(item.promo_label);
    const seenAt = parseDate(item.scraper_at);
    const runId = await this.existingRun(item.run_id);

    const key = { chainId: chain.id, externalId: item.external };
    const existing = await this.prisma.listing.findUnique({
      where: { chainId_externalId: key },
    });

    const changed =
      !existing ||
      Number(existing.currentPrice) !== price ||
      toNumberOrNull(existing.regularPrice) !== regularPrice ||
      existing.isOnPromo !== isOnPromo ||
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
      isOnPromo,
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
            promoType: promoTypeOf(regularPrice, item.promo_label),
            promoLabel: item.promo_label ?? null,
            promoEndsAt: parseOptionalDate(item.promo_ends_at),
            inStock,
            capturedAt: seenAt,
            scrapeRunId: runId,
          },
        });
        if (runId) {
          await tx.scrapeRun.update({
            where: { id: runId },
            data: { itemsChanged: { increment: 1 } },
          });
        }
      }

      return saved;
    });

    if (!listing.variantId && barcodes.length > 0) {
      await this.matchByBarcode(listing.id, barcodes);
    }

    return changed ? 'changed' : 'unchanged';
  }

  /** Оновлює ScrapeRun за подією від парсера */
  async handleRunEvent(event: RunEventDto): Promise<void> {
    const runId = await this.existingRun(event.run_id);
    if (!runId) return;

    const at = parseDate(event.at);
    const counters = {
      pagesFetched: event.pages_fetched ?? 0,
      itemsSeen: event.items_seen ?? 0,
    };
    const data: Prisma.ScrapeRunUpdateInput =
      event.kind === 'run_started'
        ? { status: 'RUNNING', startedAt: at }
        : event.kind === 'run_finished'
          ? {
              status: event.error ? 'PARTIAL' : 'SUCCESS',
              finishedAt: at,
              error: event.error ?? null,
              ...counters,
            }
          : {
              status: 'FAILED',
              finishedAt: at,
              error: event.error ?? 'Невідома помилка',
              ...counters,
            };

    await this.prisma.scrapeRun.update({ where: { id: runId }, data });
    this.logger.log(`Запуск ${event.store}: ${event.kind}`);
  }

  private async existingRun(runId?: string | null): Promise<string | null> {
    if (!runId) return null;
    let exists = this.knownRuns.get(runId);
    if (exists === undefined) {
      const run = await this.prisma.scrapeRun.findUnique({
        where: { id: runId },
        select: { id: true },
      });
      exists = run !== null;
      this.knownRuns.set(runId, exists);
    }
    return exists ? runId : null;
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
  // Фасування з окремого поля сайту надійніше за розбір назви
  return parseQuantity(item.size ?? '') ?? parseQuantity(item.name);
}

function promoTypeOf(
  regularPrice: number | null,
  label?: string | null,
): PromoType | null {
  if (label && /карт|loyal|plus/i.test(label)) return 'LOYALTY';
  if (label && /\d\s*\+\s*\d/.test(label)) return 'MULTIBUY';
  return regularPrice !== null || label ? 'DISCOUNT' : null;
}

function parseDate(value: string): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseOptionalDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

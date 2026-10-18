import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PromoType } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MatchingService } from '../../catalog/matching/matching.service';
import {
  computeUnitPrice,
  normalizeBarcodes,
  ParsedQuantity,
  parseQuantity,
} from '@repo/matching';
import { RunEventMessage, ScrapedProductMessage } from '@repo/contracts';

export type IngestResult = 'skipped' | 'unchanged' | 'changed';

/**
 * Повний обхід, що побачив менше цієї частки активних карток мережі, підозрілий
 * (зламався парсер, сайт змінив верстку) — зниклі картки за ним не знімаємо.
 */
export const MIN_SEEN_SHARE_TO_DELIST = 0.5;

/**
 * Дата закінчення акції — останній день її дії (YYYY-MM-DD → 00:00 UTC), тож знімаємо
 * не раніше ніж через добу, з запасом на часові пояси мереж.
 */
export const PROMO_GRACE_MS = 30 * 60 * 60 * 1000;

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
  ) {}

  async ingest(item: ScrapedProductMessage): Promise<IngestResult> {
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
    // Як у БД (DECIMAL(12,2)), інакше 24.999 ≠ 25.00 і запис історії на кожному обході
    const price = toCents(item.price);
    const oldPrice = item.old_price == null ? null : toCents(item.old_price);
    const regularPrice =
      oldPrice !== null && oldPrice > price ? oldPrice : null;
    const unitPrice = computeUnitPrice(price, quantity);
    const inStock = item.in_stock ?? true;
    const isOnPromo = regularPrice !== null || Boolean(item.promo_label);
    const promoEndsAt = isOnPromo
      ? parseOptionalDate(item.promo_ends_at)
      : null;
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
      promoEndsAt,
      inStock,
      lastSeenAt: seenAt,
      // Картку знову бачимо на сайті
      delistedAt: null,
      ...(runId && { lastRunId: runId }),
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
            promoEndsAt,
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
  async handleRunEvent(event: RunEventMessage): Promise<void> {
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
    if (event.kind === 'run_finished' && !event.error) {
      await this.delistMissing(runId, event.items_seen, at);
    }
    // Після запуску зіставляємо нові картки з каталогом (у фоні)
    if (event.kind !== 'run_started') this.matching.schedule();
  }

  /**
   * Після успішного повного обходу: картки мережі, яких у ньому не було, зникли з сайту
   * (тижнева акція закінчилась, товар зняли) — позначаємо delistedAt, щоб каталог їх не показував.
   */
  async delistMissing(runId: string, itemsSeen: number, at: Date) {
    const run = await this.prisma.scrapeRun.findUnique({
      where: { id: runId },
      select: { chainId: true, maxPages: true },
    });
    if (!run || run.maxPages !== null) return 0;
    const active = await this.prisma.listing.count({
      where: { chainId: run.chainId, delistedAt: null },
    });
    if (itemsSeen < active * MIN_SEEN_SHARE_TO_DELIST) {
      this.logger.warn(
        `Обхід ${runId} побачив ${itemsSeen} з ${active} активних карток — зниклі не знімаємо`,
      );
      return 0;
    }
    const { count } = await this.prisma.listing.updateMany({
      where: {
        chainId: run.chainId,
        delistedAt: null,
        OR: [{ lastRunId: null }, { lastRunId: { not: runId } }],
      },
      data: { delistedAt: at, isOnPromo: false },
    });
    if (count > 0)
      this.logger.log(`Зникли з сайту: ${count} карток (${runId})`);
    return count;
  }

  /**
   * Акції, що закінчились між обходами: картка повертається до звичайної ціни (якщо
   * вона відома), а в історії зʼявляється запис без акції. Наступний обхід однаково
   * перезапише картку справжніми даними сайту.
   */
  async expirePromos(now = new Date()): Promise<number> {
    const expired = await this.prisma.listing.findMany({
      where: {
        isOnPromo: true,
        promoEndsAt: { lte: new Date(now.getTime() - PROMO_GRACE_MS) },
      },
      select: {
        id: true,
        currentPrice: true,
        regularPrice: true,
        unitPrice: true,
        inStock: true,
        measure: true,
        netQuantity: true,
        packCount: true,
        isWeighted: true,
      },
      take: 1000,
    });
    for (const listing of expired) {
      const price = Number(listing.regularPrice ?? listing.currentPrice);
      const unitPrice =
        listing.regularPrice !== null && listing.measure
          ? computeUnitPrice(price, {
              measure: listing.measure,
              netQuantity: Number(listing.netQuantity),
              packCount: listing.packCount ?? 1,
              isWeighted: listing.isWeighted,
            })
          : toNumberOrNull(listing.unitPrice);
      await this.prisma.$transaction([
        this.prisma.listing.update({
          where: { id: listing.id },
          data: {
            isOnPromo: false,
            promoEndsAt: null,
            currentPrice: price,
            regularPrice: null,
            unitPrice,
          },
        }),
        this.prisma.priceSnapshot.create({
          data: {
            listingId: listing.id,
            price,
            unitPrice,
            inStock: listing.inStock,
            capturedAt: now,
          },
        }),
      ]);
    }
    if (expired.length > 0) {
      this.logger.log(`Акції закінчились: ${expired.length} карток`);
    }
    return expired.length;
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

function isValid(item: ScrapedProductMessage): boolean {
  return (
    typeof item?.store === 'string' &&
    typeof item.external === 'string' &&
    typeof item.name === 'string' &&
    item.name.trim().length > 0 &&
    typeof item.price === 'number' &&
    item.price > 0
  );
}

export function resolveQuantity(
  item: ScrapedProductMessage,
): ParsedQuantity | null {
  const unit = item.price_unit?.toLowerCase();
  if (unit === 'кг' || unit === 'kg') {
    return {
      measure: 'MASS',
      netQuantity: 1000,
      packCount: 1,
      isWeighted: true,
    };
  }
  // Фасування з окремого поля сайту надійніше за розбір назви, але поле часто
  // описує одну пляшку з упаковки: "1,5л 6шт" у назві, volume = 1500 у даних
  const fromName = parseQuantity(item.name);
  if (fromName && fromName.packCount > 1) return fromName;
  return parseQuantity(item.size ?? '') ?? fromName;
}

function promoTypeOf(
  regularPrice: number | null,
  label?: string | null,
): PromoType | null {
  // "Ціна з карткою", "Kaufland Card", "Lidl Plus", "PENNY App"
  if (label && /карт|card|loyal|plus|\bapp\b/i.test(label)) return 'LOYALTY';
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

function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

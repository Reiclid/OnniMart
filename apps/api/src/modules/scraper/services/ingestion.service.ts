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
import { withFields } from '../../../logger';
import { FRESHNESS_LIMITS } from '../../quality/freshness';

export type IngestResult = 'skipped' | 'unchanged' | 'changed';

/**
 * Повний обхід, що побачив менше цієї частки активних карток мережі, підозрілий
 * (зламався парсер, сайт змінив верстку) — зниклі картки за ним не знімаємо.
 */
export const MIN_SEEN_SHARE_TO_DELIST = FRESHNESS_LIMITS.delistShare;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Дата закінчення акції — останній день її дії (YYYY-MM-DD → 00:00 UTC), тож знімаємо
 * не раніше ніж через добу, з запасом на часові пояси мереж.
 */
export const PROMO_GRACE_MS = 30 * 60 * 60 * 1000;

/** Як часто воркер пише прогрес обходу (товарів записано) у scrape_runs */
export const PROGRESS_FLUSH_MS = 2000;

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
  /** Мережі за slug — щоб не читати store_chains на кожен товар (10 хв) */
  private readonly chains = new Map<
    string,
    { chain: { id: string } | null; at: number }
  >();
  /**
   * Прогрес обходу на ходу: скільки товарів запуску вже записано. Лічильник у БД оновлюється
   * раз на PROGRESS_FLUSH_MS (а не на кожен товар); у кінці запуску його перепише run_finished
   */
  private readonly progress = new Map<string, number>();
  private progressFlushedAt = 0;
  /** Перемикач правила «Збіг штрихкоду» (/admin/rules), кеш на хвилину */
  private barcodeRule = { on: true, at: 0 };

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

    const chain = await this.chainBySlug(item.store);
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
    if (runId) {
      this.progress.set(runId, (this.progress.get(runId) ?? 0) + 1);
      if (Date.now() - this.progressFlushedAt > PROGRESS_FLUSH_MS)
        await this.flushProgress();
    }

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

    // Назва чи бренд змінились — слова назви для IDF порахує воркер заново
    const renamed =
      !existing ||
      existing.rawName !== item.name ||
      existing.rawBrand !== (item.brand ?? null);

    const fields = {
      ...(renamed && { tokenizedAt: null }),
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

    // Ціна й наявність ті самі (більшість щоденного обходу) — один запит без транзакції
    const listing =
      existing && !changed
        ? await this.prisma.listing.update({
            where: { id: existing.id },
            data: fields,
          })
        : await this.save(key, fields, seenAt, {
            price,
            regularPrice,
            unitPrice,
            promoType: promoTypeOf(regularPrice, item.promo_label),
            promoLabel: item.promo_label ?? null,
            promoEndsAt,
            inStock,
            capturedAt: seenAt,
            scrapeRunId: runId,
          });

    if (!listing.variantId && barcodes.length > 0) {
      await this.matchByBarcode(listing.id, barcodes);
    }

    return changed ? 'changed' : 'unchanged';
  }

  /** Нова або змінена картка: збереження + запис історії цін в одній транзакції */
  private save(
    key: { chainId: string; externalId: string },
    fields: Omit<Prisma.ListingUncheckedCreateInput, 'chainId' | 'externalId'>,
    seenAt: Date,
    snapshot: Omit<Prisma.PriceSnapshotUncheckedCreateInput, 'listingId'>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.listing.upsert({
        where: { chainId_externalId: key },
        create: { ...key, ...fields, firstSeenAt: seenAt },
        update: fields,
      });
      await tx.priceSnapshot.create({
        data: { ...snapshot, listingId: saved.id },
      });
      if (snapshot.scrapeRunId) {
        await tx.scrapeRun.update({
          where: { id: snapshot.scrapeRunId },
          data: { itemsChanged: { increment: 1 } },
        });
      }
      return saved;
    });
  }

  /** Записує накопичені лічильники прогресу (itemsSeen += n) */
  async flushProgress(): Promise<void> {
    this.progressFlushedAt = Date.now();
    const pending = [...this.progress];
    this.progress.clear();
    for (const [id, n] of pending) {
      await this.prisma.scrapeRun.update({
        where: { id },
        data: { itemsSeen: { increment: n } },
      });
    }
  }

  /** Оновлює ScrapeRun за подією від парсера */
  async handleRunEvent(event: RunEventMessage): Promise<void> {
    const runId = await this.existingRun(event.run_id);
    if (!runId) return;
    // Товари цього запуску прийшли раніше за подію: спершу їхній прогрес, потім підсумок
    await this.flushProgress();

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
              status:
                event.error || (await this.failedItems(runId)) > 0
                  ? 'PARTIAL'
                  : 'SUCCESS',
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

    const run = await this.prisma.scrapeRun.update({
      where: { id: runId },
      data,
    });
    // Сторінки отримано — robots.txt цим запуском прочитано й він дозволяє обхід
    if (
      event.kind !== 'run_started' &&
      event.pages_fetched > 0 &&
      run?.chainId
    ) {
      await this.prisma.storeChain.update({
        where: { id: run.chainId },
        data: { robotsCheckedAt: at },
      });
    }
    this.logger.log(
      withFields(`Подія обходу: ${event.kind}`, {
        run_id: runId,
        store: event.store,
        pages: event.pages_fetched,
        items: event.items_seen,
      }),
    );
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
    if (!run || run.maxPages !== null || itemsSeen === 0) return 0;
    const active = await this.prisma.listing.count({
      where: { chainId: run.chainId, delistedAt: null },
    });
    // Акційні мережі показують лише частину карток: без цього старі ціни не знімались би ніколи.
    // Обхід міг бути збоєм, тож знімаємо лише давно не бачені; повернуться наступним обходом.
    const tooFew = itemsSeen < active * MIN_SEEN_SHARE_TO_DELIST;
    if (tooFew) {
      this.logger.warn(
        withFields('Обхід побачив замало карток — знімаємо лише старі', {
          run_id: runId,
          seen: itemsSeen,
          active,
        }),
      );
    }
    const { count } = await this.prisma.listing.updateMany({
      where: {
        chainId: run.chainId,
        delistedAt: null,
        OR: [{ lastRunId: null }, { lastRunId: { not: runId } }],
        ...(tooFew && {
          lastSeenAt: {
            lt: new Date(at.getTime() - FRESHNESS_LIMITS.staleDays * DAY),
          },
        }),
      },
      data: { delistedAt: at, isOnPromo: false },
    });
    if (count > 0)
      this.logger.log(
        withFields('Зникли з сайту', { run_id: runId, listings: count }),
      );
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

  private async chainBySlug(slug: string) {
    const cached = this.chains.get(slug);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.chain;
    const chain = await this.prisma.storeChain.findUnique({
      where: { slug },
      select: { id: true },
    });
    this.chains.set(slug, { chain, at: Date.now() });
    return chain;
  }

  private async failedItems(runId: string): Promise<number> {
    const run = await this.prisma.scrapeRun.findUnique({
      where: { id: runId },
      select: { itemsFailed: true },
    });
    return run?.itemsFailed ?? 0;
  }

  /** Повідомлення запуску не вдалося обробити (dead-letter) — рахуємо в журналі */
  async countFailed(runId?: string | null): Promise<void> {
    const id = await this.existingRun(runId);
    if (!id) return;
    await this.prisma.scrapeRun.update({
      where: { id },
      data: { itemsFailed: { increment: 1 } },
    });
  }

  private async existingRun(runId?: string | null): Promise<string | null> {
    if (!runId) return null;
    let exists = this.knownRuns.get(runId);
    if (exists === undefined) {
      if (this.knownRuns.size > 1000) this.knownRuns.clear();
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
    const owners = await this.prisma.barcode.findMany({
      where: { gtin: { in: gtins } },
      select: { gtin: true, variantId: true },
    });
    const variants = [...new Set(owners.map((o) => o.variantId))];
    if (variants.length === 0) return;
    if (variants.length > 1) {
      // Штрихкоди картки належать різним фасуванням — схоже на дубль у каталозі;
      // не вгадуємо, картку розгляне пакетне зіставлення
      this.logger.warn(
        `Картка ${listingId}: штрихкоди ведуть до різних фасувань (${owners
          .map((o) => `${o.gtin}→${o.variantId}`)
          .join(', ')})`,
      );
      return;
    }
    // Правило вимкнене на /admin/rules — картку зіставить пакет за назвою
    if (!(await this.barcodeRuleOn())) return;

    // Лише якщо картку тим часом не зіставили (пакет зіставлення, модератор)
    const { count } = await this.prisma.listing.updateMany({
      where: { id: listingId, variantId: null },
      data: {
        variantId: variants[0],
        matchStatus: 'AUTO_MATCHED',
        matchMethod: 'BARCODE',
        matchScore: 1,
        matchedAt: new Date(),
      },
    });
    if (count > 0) {
      await this.prisma.matchRuleHit.create({
        data: { rule: 'barcode', listingId, decision: 'barcode' },
      });
    }
  }

  private async barcodeRuleOn(): Promise<boolean> {
    if (Date.now() - this.barcodeRule.at > 60_000) {
      const row = await this.prisma.matchingRule.findUnique({
        where: { key: 'barcode' },
        select: { enabled: true },
      });
      this.barcodeRule = { on: row?.enabled ?? true, at: Date.now() };
    }
    return this.barcodeRule.on;
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

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

  /** Одна картка — окремий випадок пакета (так її обробляє повтор після збою) */
  async ingest(item: ScrapedProductMessage): Promise<IngestResult> {
    return (await this.ingestBatch([item]))[0];
  }

  /**
   * Пакет карток: один запит на наявні картки, одна транзакція на запис (із одним
   * INSERT історії цін і одним оновленням itemsChanged на запуск), один запит на
   * власників штрихкодів. Некоректна картка чи невідома мережа дають 'skipped' і не
   * зачіпають решту пакета. Результати йдуть у порядку вхідного масиву.
   */
  async ingestBatch(items: ScrapedProductMessage[]): Promise<IngestResult[]> {
    const results = items.map((): IngestResult => 'skipped');
    const prepared: Prepared[] = [];
    for (const [index, item] of items.entries()) {
      const entry = await this.prepare(item, index);
      if (entry) prepared.push(entry);
    }
    // Дві версії однієї картки в пакеті пишемо по черзі: друга бачить результат першої
    for (const group of uniqueKeyGroups(prepared)) {
      const changed = await this.writeGroup(group);
      for (const [i, entry] of group.entries()) {
        results[entry.index] = changed[i] ? 'changed' : 'unchanged';
        if (entry.runId) {
          this.progress.set(
            entry.runId,
            (this.progress.get(entry.runId) ?? 0) + 1,
          );
        }
      }
    }
    if (
      this.progress.size > 0 &&
      Date.now() - this.progressFlushedAt > PROGRESS_FLUSH_MS
    ) {
      await this.flushProgress();
    }
    return results;
  }

  private async prepare(
    item: ScrapedProductMessage,
    index: number,
  ): Promise<Prepared | null> {
    if (!isValid(item)) {
      this.logger.warn(
        `Некоректне повідомлення від парсера: ${JSON.stringify(item)}`,
      );
      return null;
    }
    const chain = await this.chainBySlug(item.store);
    if (!chain) {
      this.logger.warn(`Невідома мережа "${item.store}" — додайте її в seed`);
      return null;
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

    return {
      index,
      key: { chainId: chain.id, externalId: item.external },
      price,
      regularPrice,
      isOnPromo,
      inStock,
      seenAt,
      runId,
      barcodes,
      fields: {
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
      },
      snapshot: {
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
    };
  }

  /**
   * Записує картки з різними ключами; повертає для кожної, чи змінилась ціна, акція
   * чи наявність. Збій відкочує всю транзакцію — повідомлення лишаються в черзі.
   */
  private async writeGroup(group: Prepared[]): Promise<boolean[]> {
    const byChain = new Map<string, string[]>();
    for (const { key } of group) {
      const ids = byChain.get(key.chainId) ?? [];
      ids.push(key.externalId);
      byChain.set(key.chainId, ids);
    }
    const found = await this.prisma.listing.findMany({
      where: {
        OR: [...byChain].map(([chainId, ids]) => ({
          chainId,
          externalId: { in: ids },
        })),
      },
    });
    const existingByKey = new Map(
      found.map((l) => [keyOf(l.chainId, l.externalId), l]),
    );

    const states = group.map((entry) => {
      const existing = existingByKey.get(
        keyOf(entry.key.chainId, entry.key.externalId),
      );
      const changed =
        !existing ||
        Number(existing.currentPrice) !== entry.price ||
        toNumberOrNull(existing.regularPrice) !== entry.regularPrice ||
        existing.isOnPromo !== entry.isOnPromo ||
        existing.inStock !== entry.inStock;
      // Назва чи бренд змінились — слова назви для IDF порахує воркер заново
      const renamed =
        !existing ||
        existing.rawName !== entry.fields.rawName ||
        existing.rawBrand !== entry.fields.rawBrand;
      return { existing, changed, renamed };
    });

    const saved = await this.prisma.$transaction(
      async (tx) => {
        const listings: { id: string; variantId: string | null }[] = [];
        const snapshots: Prisma.PriceSnapshotCreateManyInput[] = [];
        const changedPerRun = new Map<string, number>();
        for (const [i, entry] of group.entries()) {
          const { existing, changed, renamed } = states[i];
          const fields = {
            ...entry.fields,
            ...(renamed && { tokenizedAt: null }),
          };
          // Ціна й наявність ті самі (більшість щоденного обходу) — лише UPDATE
          const listing =
            existing && !changed
              ? await tx.listing.update({
                  where: { id: existing.id },
                  data: fields,
                })
              : await tx.listing.upsert({
                  where: { chainId_externalId: entry.key },
                  create: {
                    ...entry.key,
                    ...fields,
                    firstSeenAt: entry.seenAt,
                  },
                  update: fields,
                });
          listings.push(listing);
          if (!changed) continue;
          snapshots.push({ ...entry.snapshot, listingId: listing.id });
          if (entry.runId) {
            changedPerRun.set(
              entry.runId,
              (changedPerRun.get(entry.runId) ?? 0) + 1,
            );
          }
        }
        if (snapshots.length > 0) {
          await tx.priceSnapshot.createMany({ data: snapshots });
        }
        for (const [id, n] of changedPerRun) {
          await tx.scrapeRun.update({
            where: { id },
            data: { itemsChanged: { increment: n } },
          });
        }
        return listings;
      },
      { timeout: 30_000 },
    );

    await this.matchByBarcodes(
      group.flatMap((entry, i) =>
        !saved[i].variantId && entry.barcodes.length > 0
          ? [{ listingId: saved[i].id, gtins: entry.barcodes }]
          : [],
      ),
    );
    return states.map((s) => s.changed);
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

  /**
   * Етап 1 зіставлення: точний збіг штрихкоду з уже відомим варіантом.
   * Власників штрихкодів усього пакета шукаємо одним запитом.
   */
  private async matchByBarcodes(
    entries: { listingId: string; gtins: string[] }[],
  ) {
    if (entries.length === 0) return;
    const owners = await this.prisma.barcode.findMany({
      where: { gtin: { in: [...new Set(entries.flatMap((e) => e.gtins))] } },
      select: { gtin: true, variantId: true },
    });
    if (owners.length === 0) return;
    const hits: Prisma.MatchRuleHitCreateManyInput[] = [];
    for (const { listingId, gtins } of entries) {
      const own = owners.filter((o) => gtins.includes(o.gtin));
      const variants = [...new Set(own.map((o) => o.variantId))];
      if (variants.length === 0) continue;
      if (variants.length > 1) {
        // Штрихкоди картки належать різним фасуванням — схоже на дубль у каталозі;
        // не вгадуємо, картку розгляне пакетне зіставлення
        this.logger.warn(
          `Картка ${listingId}: штрихкоди ведуть до різних фасувань (${own
            .map((o) => `${o.gtin}→${o.variantId}`)
            .join(', ')})`,
        );
        continue;
      }
      // Правило вимкнене на /admin/rules — картки зіставить пакет за назвою
      if (!(await this.barcodeRuleOn())) break;

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
        hits.push({ rule: 'barcode', listingId, decision: 'barcode' });
      }
    }
    if (hits.length > 0) {
      await this.prisma.matchRuleHit.createMany({ data: hits });
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

/** Картка, готова до запису */
interface Prepared {
  /** Позиція в пакеті, щоб повернути результат у тому ж порядку */
  index: number;
  key: { chainId: string; externalId: string };
  price: number;
  regularPrice: number | null;
  isOnPromo: boolean;
  inStock: boolean;
  seenAt: Date;
  runId: string | null;
  barcodes: string[];
  fields: Omit<Prisma.ListingUncheckedCreateInput, 'chainId' | 'externalId'>;
  snapshot: Omit<Prisma.PriceSnapshotUncheckedCreateInput, 'listingId'>;
}

const keyOf = (chainId: string, externalId: string) =>
  `${chainId}\0${externalId}`;

/** Ділить пакет на групи з унікальними ключами; порядок записів зберігається */
function uniqueKeyGroups(list: Prepared[]): Prepared[][] {
  const groups: Prepared[][] = [];
  let seen = new Set<string>();
  for (const entry of list) {
    const key = keyOf(entry.key.chainId, entry.key.externalId);
    if (groups.length === 0 || seen.has(key)) {
      groups.push([]);
      seen = new Set();
    }
    seen.add(key);
    groups[groups.length - 1].push(entry);
  }
  return groups;
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

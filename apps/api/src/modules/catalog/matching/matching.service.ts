import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  MATCHING_STATE_KEY,
  MatchingState,
  MatchReport,
} from '@repo/contracts';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { createRedis } from '../../../redis';
import {
  CatalogIndex,
  extractFeatures,
  lineOf,
  ListingInput,
  MatchDecision,
  prepareListings,
  quantityKey,
  slugify,
  stripQuantity,
  variantLabel,
  variantLabelOf,
} from '@repo/matching';

type Row = Awaited<ReturnType<MatchingService['loadListings']>>[number];

/**
 * Зіставлення карток мереж з каталогом (docs/02-database.md):
 *   1. штрихкод уже відомий → те саме фасування;
 *   2. нечітка схожість назви ≥ 0,90 з фасуванням того самого розміру → те саме фасування;
 *   3. 0,70–0,90 → кандидати в чергу модерації;
 *   4. той самий бренд і назва, але інше фасування → нове фасування товару;
 *   5. інакше → новий товар у каталозі.
 * Працює пакетно у воркері (src/worker.ts): після кожного запуску парсера і на запит API
 * (черга matching:requests). Стан публікує в Redis (matching:state) для API.
 */
@Injectable()
export class MatchingService implements OnModuleDestroy {
  private readonly logger = new Logger(MatchingService.name);
  private readonly redis = createRedis();
  private current: Promise<MatchReport> | null = null;
  private again = false;
  private last: MatchReport | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy() {
    this.redis.disconnect();
  }

  get running(): boolean {
    return this.current !== null;
  }

  /** Запустити у фоні; якщо зіставлення вже йде — повторити після нього */
  schedule(): void {
    void this.run().catch((error: unknown) =>
      this.logger.error(`Зіставлення впало: ${String(error)}`),
    );
  }

  run(): Promise<MatchReport> {
    if (this.current) {
      this.again = true;
      return this.current;
    }
    this.current = this.execute().finally(() => {
      this.current = null;
      void this.publish();
      if (this.again) {
        this.again = false;
        this.schedule();
      }
    });
    void this.publish();
    return this.current;
  }

  /** Стан для API: GET /api/v1/matching/status */
  private async publish(): Promise<void> {
    const state: MatchingState = {
      running: this.running,
      lastReport: this.last,
      updatedAt: new Date().toISOString(),
    };
    try {
      await this.redis.set(MATCHING_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      this.logger.warn(`Не вдалося опублікувати стан: ${String(error)}`);
    }
  }

  private loadListings() {
    return this.prisma.listing.findMany({
      select: {
        id: true,
        chainId: true,
        rawName: true,
        rawBrand: true,
        imageUrl: true,
        barcodes: true,
        measure: true,
        netQuantity: true,
        packCount: true,
        isWeighted: true,
        variantId: true,
        matchStatus: true,
        chain: { select: { slug: true, countryCode: true } },
      },
    });
  }

  private async execute(): Promise<MatchReport> {
    const startedAt = new Date();
    const rows = await this.loadListings();
    const { inputs, vocabulary } = prepareListings(
      rows.map((r) => ({
        ...r,
        country: r.chain.countryCode,
        netQuantity: r.netQuantity === null ? null : Number(r.netQuantity),
      })),
    );
    const index = new CatalogIndex();
    for (const [country, docs] of vocabulary)
      index.setVocabulary(country, docs);

    const context = await this.loadCatalog(index, rows, inputs);
    const report: MatchReport = {
      startedAt: startedAt.toISOString(),
      finishedAt: '',
      processed: 0,
      byBarcode: 0,
      fuzzy: 0,
      review: 0,
      newVariants: 0,
      newProducts: 0,
    };

    // Спершу картки зі штрихкодами: вони створюють надійні "якорі" для решти
    const pending = rows
      .filter(
        (r) =>
          !r.variantId &&
          r.matchStatus === 'PENDING' &&
          !context.waiting.has(r.id),
      )
      .sort(
        (a, b) =>
          Number(b.barcodes.length > 0) - Number(a.barcodes.length > 0) ||
          a.chain.slug.localeCompare(b.chain.slug) ||
          a.rawName.localeCompare(b.rawName),
      );

    for (const row of pending) {
      const listing = inputs.get(row.id)!;
      const decision = index.decide(listing);
      await this.apply(decision, row, listing, index, context);
      report.processed++;
      if (decision.kind === 'barcode') report.byBarcode++;
      else if (decision.kind === 'fuzzy') report.fuzzy++;
      else if (decision.kind === 'review') report.review++;
      else if (decision.kind === 'variant') report.newVariants++;
      else report.newProducts++;
    }

    report.finishedAt = new Date().toISOString();
    this.last = report;
    this.logger.log(
      `Зіставлення: ${report.processed} карток — штрихкод ${report.byBarcode}, ` +
        `схожість ${report.fuzzy}, модерація ${report.review}, ` +
        `нових фасувань ${report.newVariants}, нових товарів ${report.newProducts}`,
    );
    return report;
  }

  /** Наявний каталог → індекс у памʼяті */
  private async loadCatalog(
    index: CatalogIndex,
    rows: Row[],
    inputs: Map<string, ListingInput>,
  ) {
    const [variants, candidates, brands, lines] = await Promise.all([
      this.prisma.productVariant.findMany({
        select: {
          id: true,
          productId: true,
          measure: true,
          netQuantity: true,
          packCount: true,
          isWeighted: true,
          barcodes: { select: { gtin: true } },
          product: {
            select: { name: true, brand: { select: { name: true } } },
          },
        },
      }),
      this.prisma.matchCandidate.findMany({
        select: { listingId: true, variantId: true, status: true },
      }),
      this.prisma.brand.findMany({ select: { id: true, slug: true } }),
      this.prisma.productLine.findMany({ select: { id: true, slug: true } }),
    ]);

    const listingsByVariant = new Map<string, ListingInput[]>();
    for (const row of rows) {
      if (!row.variantId) continue;
      const list = listingsByVariant.get(row.variantId) ?? [];
      list.push(inputs.get(row.id)!);
      listingsByVariant.set(row.variantId, list);
    }

    for (const variant of variants) {
      const productFeatures = extractFeatures(
        variant.product.name,
        variant.product.brand?.name,
      );
      const key = quantityKey({
        measure: variant.measure,
        netQuantity:
          variant.netQuantity === null ? null : Number(variant.netQuantity),
        packCount: variant.packCount,
        isWeighted: variant.isWeighted,
      });
      const linked = listingsByVariant.get(variant.id) ?? [];
      for (const country of new Set(linked.map((l) => l.country))) {
        index.addProduct(variant.productId, productFeatures, country);
      }
      index.addVariant(variant.id, variant.productId, key);
      for (const { gtin } of variant.barcodes)
        index.addBarcode(variant.id, gtin);
      for (const country of new Set(linked.map((l) => l.country))) {
        index.addName(variant.id, productFeatures, country);
      }
      for (const listing of linked) {
        index.addName(
          variant.id,
          listing.features,
          listing.country,
          listing.chainId,
        );
      }
    }

    const waiting = new Set<string>();
    for (const candidate of candidates) {
      if (candidate.status === 'REJECTED') {
        index.reject(candidate.listingId, candidate.variantId);
      } else if (candidate.status === 'SUGGESTED') {
        waiting.add(candidate.listingId);
      }
    }

    // Як бренд записаний у мережах: ключ → перша назва ("coca-cola" → "Coca-Cola")
    const brandNames = new Map<string, string>();
    for (const row of rows) {
      const key = row.rawBrand ? inputs.get(row.id)!.features.brand : null;
      if (key && row.rawBrand && !brandNames.has(key)) {
        brandNames.set(key, row.rawBrand.trim());
      }
    }

    return {
      waiting,
      brandNames,
      brandIds: new Map(brands.map((b) => [b.slug, b.id])),
      lineIds: new Map(lines.map((l) => [l.slug, l.id])),
    };
  }

  private async apply(
    decision: MatchDecision,
    row: Row,
    listing: ListingInput,
    index: CatalogIndex,
    context: Awaited<ReturnType<MatchingService['loadCatalog']>>,
  ): Promise<void> {
    const now = new Date();
    const link = (
      variantId: string,
      method: 'BARCODE' | 'FUZZY' | 'CREATED',
      score: number,
    ) =>
      this.prisma.listing.update({
        where: { id: row.id },
        data: {
          variantId,
          matchStatus: 'AUTO_MATCHED',
          matchMethod: method,
          matchScore: score,
          matchedAt: now,
        },
      });

    switch (decision.kind) {
      case 'barcode':
      case 'fuzzy': {
        const score = decision.kind === 'fuzzy' ? decision.score : 1;
        await this.prisma.$transaction([
          link(
            decision.variantId,
            decision.kind === 'fuzzy' ? 'FUZZY' : 'BARCODE',
            score,
          ),
          this.newBarcodes(decision.variantId, row, index),
        ]);
        this.register(index, decision.variantId, row, listing);
        return;
      }
      case 'review': {
        await this.prisma.matchCandidate.createMany({
          data: decision.candidates.map((c) => ({
            listingId: row.id,
            variantId: c.variantId,
            score: c.score,
            details: {
              name: c.name,
              brand: c.brand,
              barcodeMismatch: c.barcodeMismatch ?? false,
            },
          })),
          skipDuplicates: true,
        });
        return;
      }
      case 'variant': {
        try {
          const variant = await this.prisma.$transaction(async (tx) => {
            const created = await tx.productVariant.create({
              data: { productId: decision.productId, ...variantData(listing) },
            });
            await tx.listing.update({
              where: { id: row.id },
              data: {
                variantId: created.id,
                matchStatus: 'AUTO_MATCHED',
                // Картка — перша в новому фасуванні; схожість із товаром лишається в matchScore
                matchMethod: 'CREATED',
                matchScore: decision.score,
                matchedAt: now,
              },
            });
            await this.barcodesFor(created.id, row, index, tx);
            return created;
          });
          index.addVariant(
            variant.id,
            decision.productId,
            quantityKey(listing.quantity),
          );
          this.register(index, variant.id, row, listing);
          return;
        } catch (error) {
          // Фасування такого розміру вже є (ваговий і фасований 1 кг) — окремий товар
          if (!isUniqueViolation(error)) throw error;
        }
        await this.createProduct(row, listing, index, context);
        return;
      }
      case 'product':
        await this.createProduct(row, listing, index, context);
        return;
    }
  }

  /** Новий товар (з лінійкою бренду) і фасування з картки мережі */
  private async createProduct(
    row: Row,
    listing: ListingInput,
    index: CatalogIndex,
    context: Awaited<ReturnType<MatchingService['loadCatalog']>>,
  ): Promise<void> {
    const features = listing.features;
    const name = stripQuantity(row.rawName) || row.rawName;
    const brandName = features.brand
      ? (context.brandNames.get(features.brand) ??
        row.rawBrand ??
        features.brand)
      : null;
    const variantLabel = variantLabelOf(features);

    const { variant, productId } = await this.prisma.$transaction(
      async (tx) => {
        let brandId: string | null = null;
        let lineId: string | null = null;
        if (features.brand && brandName) {
          brandId = context.brandIds.get(features.brand) ?? null;
          if (!brandId) {
            const brand = await tx.brand.upsert({
              where: { slug: features.brand },
              create: { slug: features.brand, name: brandName },
              update: {},
            });
            brandId = brand.id;
            context.brandIds.set(features.brand, brandId);
          }
          const line = lineOf(features, brandName);
          lineId = context.lineIds.get(line.slug) ?? null;
          if (!lineId) {
            const created = await tx.productLine.upsert({
              where: { slug: line.slug },
              create: { slug: line.slug, name: line.name, brandId },
              update: {},
            });
            lineId = created.id;
            context.lineIds.set(line.slug, lineId);
          }
        }

        const product = await tx.product.create({
          data: {
            name,
            slug: `${slugify(`${brandName ?? ''} ${name}`).slice(0, 80)}-${randomUUID().slice(0, 6)}`,
            variantLabel,
            imageUrl: row.imageUrl,
            brandId,
            lineId,
            variants: { create: variantData(listing) },
          },
          include: { variants: true },
        });
        const created = product.variants[0];
        await tx.listing.update({
          where: { id: row.id },
          data: {
            variantId: created.id,
            matchStatus: 'AUTO_MATCHED',
            matchMethod: 'CREATED',
            matchScore: 1,
            matchedAt: new Date(),
          },
        });
        await this.barcodesFor(created.id, row, index, tx);
        return { variant: created, productId: product.id };
      },
    );

    index.addProduct(productId, features, listing.country);
    index.addVariant(variant.id, productId, quantityKey(listing.quantity));
    this.register(index, variant.id, row, listing);
  }

  /** Штрихкоди картки, яких ще немає в каталозі */
  private unknownBarcodes(row: Row, index: CatalogIndex): string[] {
    return row.barcodes.filter((gtin) => !index.barcodeOwner(gtin));
  }

  private newBarcodes(variantId: string, row: Row, index: CatalogIndex) {
    return this.prisma.barcode.createMany({
      data: this.unknownBarcodes(row, index).map((gtin) => ({
        gtin,
        variantId,
        source: row.chain.slug,
      })),
      skipDuplicates: true,
    });
  }

  private async barcodesFor(
    variantId: string,
    row: Row,
    index: CatalogIndex,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const gtins = this.unknownBarcodes(row, index);
    if (gtins.length === 0) return;
    await tx.barcode.createMany({
      data: gtins.map((gtin) => ({ gtin, variantId, source: row.chain.slug })),
      skipDuplicates: true,
    });
  }

  /** Картка тепер частина фасування: її назва й штрихкоди допомагають наступним */
  private register(
    index: CatalogIndex,
    variantId: string,
    row: Row,
    listing: ListingInput,
  ) {
    for (const gtin of row.barcodes) index.addBarcode(variantId, gtin);
    index.addName(
      variantId,
      listing.features,
      listing.country,
      listing.chainId,
    );
  }
}

function variantData(listing: ListingInput) {
  return { ...listing.quantity, label: variantLabel(listing.quantity) };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

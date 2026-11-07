import { Injectable, NotFoundException } from '@nestjs/common';
import { runProgress, type PreviousRun } from './progress';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeGtin } from '@repo/matching';
import { listingInclude, toListingDto } from '../../common/listing.mapper';
import { clampPageSize, isTrue, pageOf, toNumber } from '../../common/query';
import { ttlCached } from '../../common/ttl-cache';
import {
  ChainStatus,
  ChainSummaryDto,
  ListingDetailsDto,
  ListingPageDto,
  ListingsQueryDto,
  ScrapeRunDto,
  StatsDto,
} from './dto/monitoring.dto';

type RunWithChain = Prisma.ScrapeRunGetPayload<{
  include: { chain: { select: { slug: true; name: true } } };
}>;

/** Як довго Огляд тримає важкі лічильники (count(*) по listings і price_snapshots) */
const COUNTS_TTL_MS = 30_000;

/** Дані для сторінок перевірки: що зібрано, коли й з якими помилками */
@Injectable()
export class MonitoringService {
  /** Підрахунки по великих таблицях: сторінка Огляд оновлюється під час парсингу, а ці лічильники не потребують точності до секунди */
  private readonly bigCounts = ttlCached(COUNTS_TTL_MS, () =>
    Promise.all([
      this.prisma.listing.count(),
      this.prisma.listing.count({ where: { variantId: { not: null } } }),
      this.prisma.listing.count({
        where: { isOnPromo: true, delistedAt: null },
      }),
      this.prisma.priceSnapshot.count(),
      this.prisma.listing.count({ where: { barcodes: { isEmpty: false } } }),
    ]),
  );

  /** Товари й акції кожної мережі одним проходом по listings */
  private readonly chainCounts = ttlCached(COUNTS_TTL_MS, async () => {
    const rows = await this.prisma.$queryRaw<
      { chainId: string; listings: number; promo: number }[]
    >`
      SELECT "chainId",
             count(*)::int AS listings,
             (count(*) FILTER (WHERE "isOnPromo" AND "delistedAt" IS NULL))::int AS promo
      FROM listings GROUP BY "chainId"`;
    return new Map(rows.map((row) => [row.chainId, row]));
  });

  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<StatsDto> {
    const [
      [
        listings,
        matchedListings,
        promoListings,
        priceSnapshots,
        listingsWithBarcode,
      ],
      chains,
      enabledChains,
      lastRun,
    ] = await Promise.all([
      this.bigCounts(),
      this.prisma.storeChain.count(),
      this.prisma.storeChain.count({ where: { scrapeEnabled: true } }),
      this.prisma.scrapeRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    ]);

    return {
      chains,
      enabledChains,
      listings,
      matchedListings,
      promoListings,
      priceSnapshots,
      listingsWithBarcode,
      lastRunAt: lastRun?.startedAt.toISOString() ?? null,
    };
  }

  async getChains(
    statuses?: ChainStatus[],
    country?: string,
  ): Promise<ChainSummaryDto[]> {
    const [chains, counts, lastRuns] = await Promise.all([
      this.prisma.storeChain.findMany({
        where: {
          ...(statuses && { status: { in: statuses } }),
          ...(country && { countryCode: country.toUpperCase() }),
        },
        orderBy: [{ countryCode: 'desc' }, { name: 'asc' }],
      }),
      this.chainCounts(),
      // distinct + orderBy: останній запуск кожної мережі
      this.prisma.scrapeRun.findMany({
        distinct: ['chainId'],
        orderBy: { startedAt: 'desc' },
        include: { chain: { select: { slug: true, name: true } } },
      }),
    ]);

    const runByChain = new Map(lastRuns.map((run) => [run.chainId, run]));

    return chains.map((chain) => {
      const run = runByChain.get(chain.id);
      return {
        id: chain.id,
        slug: chain.slug,
        name: chain.name,
        website: chain.website,
        countryCode: chain.countryCode,
        currency: chain.currency,
        scrapeEnabled: chain.scrapeEnabled,
        status: chain.status,
        onlinePrices: chain.onlinePrices,
        notes: chain.notes,
        listingsCount: counts.get(chain.id)?.listings ?? 0,
        promoCount: counts.get(chain.id)?.promo ?? 0,
        lastRun: run ? toRunDto(run) : null,
      };
    });
  }

  async getScrapeRuns(limit = 20): Promise<ScrapeRunDto[]> {
    const runs = await this.prisma.scrapeRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: { chain: { select: { slug: true, name: true } } },
    });
    const now = new Date();
    return Promise.all(
      runs.map(async (run) => ({
        ...toRunDto(run),
        ...runProgress(
          run,
          run.status === 'RUNNING' ? await this.previousRun(run) : null,
          now,
        ),
      })),
    );
  }

  /** Останній вдалий обхід тієї самої мережі з тим самим обмеженням сторінок — мірило прогресу */
  private async previousRun(run: {
    id: string;
    chainId: string;
    maxPages: number | null;
  }): Promise<PreviousRun | null> {
    const previous = await this.prisma.scrapeRun.findFirst({
      where: {
        chainId: run.chainId,
        id: { not: run.id },
        maxPages: run.maxPages,
        status: { in: ['SUCCESS', 'PARTIAL'] },
        itemsSeen: { gt: 0 },
        finishedAt: { not: null },
      },
      orderBy: { startedAt: 'desc' },
      select: { itemsSeen: true, startedAt: true, finishedAt: true },
    });
    return previous?.finishedAt
      ? { ...previous, finishedAt: previous.finishedAt }
      : null;
  }

  async getListings(query: ListingsQueryDto): Promise<ListingPageDto> {
    const page = pageOf(query.page);
    const pageSize = clampPageSize(query.pageSize);
    const where = buildWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        include: listingInclude,
        orderBy: [{ lastSeenAt: 'desc' }, { rawName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return { items: items.map(toListingDto), total, page, pageSize };
  }

  async getListing(id: string): Promise<ListingDetailsDto> {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        ...listingInclude,
        variant: { include: { product: { select: { name: true } } } },
        priceSnapshots: { orderBy: { capturedAt: 'desc' }, take: 200 },
      },
    });
    if (!listing) {
      throw new NotFoundException(`Товар ${id} не знайдено`);
    }

    // Той самий товар в інших мережах: те саме фасування каталогу
    // (за штрихкодом або схожістю назви) чи хоча б спільний штрихкод
    const same: Prisma.ListingWhereInput[] = [];
    if (listing.variantId) same.push({ variantId: listing.variantId });
    if (listing.barcodes.length) {
      same.push({ barcodes: { hasSome: listing.barcodes } });
    }
    const otherOffers = same.length
      ? await this.prisma.listing.findMany({
          where: { id: { not: listing.id }, OR: same },
          include: listingInclude,
          // Спершу українські мережі (₴), далі німецькі (€); у межах валюти — дешевші
          orderBy: [{ chain: { countryCode: 'desc' } }, { unitPrice: 'asc' }],
          take: 50,
        })
      : [];

    return {
      ...toListingDto(listing),
      firstSeenAt: listing.firstSeenAt.toISOString(),
      variant: listing.variant
        ? {
            id: listing.variant.id,
            productId: listing.variant.productId,
            label: listing.variant.label,
            productName: listing.variant.product.name,
          }
        : null,
      history: listing.priceSnapshots.map((snapshot) => ({
        id: snapshot.id.toString(),
        price: Number(snapshot.price),
        regularPrice: toNumber(snapshot.regularPrice),
        unitPrice: toNumber(snapshot.unitPrice),
        promoType: snapshot.promoType,
        promoLabel: snapshot.promoLabel,
        promoEndsAt: snapshot.promoEndsAt?.toISOString() ?? null,
        inStock: snapshot.inStock,
        capturedAt: snapshot.capturedAt.toISOString(),
      })),
      otherOffers: otherOffers.map(toListingDto),
      rawData: (listing.rawData as Record<string, unknown> | null) ?? null,
    };
  }
}

export function buildWhere(query: ListingsQueryDto): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {};
  if (query.chain || query.country) {
    where.chain = {
      ...(query.chain && { slug: query.chain }),
      ...(query.country && { countryCode: query.country }),
    };
  }
  if (isTrue(query.promo)) {
    where.isOnPromo = true;
    where.delistedAt = null;
  }
  if (isTrue(query.matched)) where.variantId = { not: null };

  const q = query.q?.trim();
  if (q) {
    const gtin = /^\d{8,14}$/.test(q) ? normalizeGtin(q) : null;
    where.OR = [
      { rawName: { contains: q, mode: 'insensitive' } },
      { rawBrand: { contains: q, mode: 'insensitive' } },
      ...(gtin ? [{ barcodes: { has: gtin } }] : []),
    ];
  }
  return where;
}

function toRunDto(run: RunWithChain): ScrapeRunDto {
  return {
    id: run.id,
    chainSlug: run.chain.slug,
    chainName: run.chain.name,
    status: run.status,
    trigger: run.trigger,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    pagesFetched: run.pagesFetched,
    itemsSeen: run.itemsSeen,
    itemsChanged: run.itemsChanged,
    itemsFailed: run.itemsFailed,
    error: run.error,
    // Прогрес рахує getScrapeRuns лише для запусків, що тривають
    expectedItems: null,
    fraction: null,
    etaSeconds: null,
  };
}

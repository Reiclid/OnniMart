import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { formatQuantity, Measure, normalizeGtin } from '@repo/matching';
import {
  ChainStatus,
  ChainSummaryDto,
  ListingDetailsDto,
  ListingPageDto,
  ListingsQueryDto,
  ListingSummaryDto,
  ScrapeRunDto,
  StatsDto,
} from './dto/monitoring.dto';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const UNIT_LABELS: Record<Measure, string> = {
  MASS: 'кг',
  VOLUME: 'л',
  COUNT: 'шт',
};

export const listingInclude = {
  chain: { select: { slug: true, name: true, currency: true } },
  variant: { select: { productId: true } },
} satisfies Prisma.ListingInclude;

export type ListingWithChain = Prisma.ListingGetPayload<{
  include: typeof listingInclude;
}>;

type RunWithChain = Prisma.ScrapeRunGetPayload<{
  include: { chain: { select: { slug: true; name: true } } };
}>;

/** Дані для сторінок перевірки: що зібрано, коли й з якими помилками */
@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<StatsDto> {
    const [
      chains,
      enabledChains,
      listings,
      matchedListings,
      promoListings,
      priceSnapshots,
      listingsWithBarcode,
      lastRun,
    ] = await Promise.all([
      this.prisma.storeChain.count(),
      this.prisma.storeChain.count({ where: { scrapeEnabled: true } }),
      this.prisma.listing.count(),
      this.prisma.listing.count({ where: { variantId: { not: null } } }),
      this.prisma.listing.count({
        where: { isOnPromo: true, delistedAt: null },
      }),
      this.prisma.priceSnapshot.count(),
      this.prisma.listing.count({ where: { barcodes: { isEmpty: false } } }),
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
    const [chains, promoCounts, lastRuns] = await Promise.all([
      this.prisma.storeChain.findMany({
        where: {
          ...(statuses && { status: { in: statuses } }),
          ...(country && { countryCode: country.toUpperCase() }),
        },
        orderBy: [{ countryCode: 'desc' }, { name: 'asc' }],
        include: { _count: { select: { listings: true } } },
      }),
      this.prisma.listing.groupBy({
        by: ['chainId'],
        where: { isOnPromo: true, delistedAt: null },
        _count: { _all: true },
      }),
      // distinct + orderBy: останній запуск кожної мережі
      this.prisma.scrapeRun.findMany({
        distinct: ['chainId'],
        orderBy: { startedAt: 'desc' },
        include: { chain: { select: { slug: true, name: true } } },
      }),
    ]);

    const promoByChain = new Map(
      promoCounts.map((row) => [row.chainId, row._count._all]),
    );
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
        listingsCount: chain._count.listings,
        promoCount: promoByChain.get(chain.id) ?? 0,
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
    return runs.map(toRunDto);
  }

  async getListings(query: ListingsQueryDto): Promise<ListingPageDto> {
    const page = Math.max(toInt(query.page) ?? 1, 1);
    const pageSize = Math.min(
      Math.max(toInt(query.pageSize) ?? DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE,
    );
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
  if (query.chain) where.chain = { slug: query.chain };
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

export function toListingDto(listing: ListingWithChain): ListingSummaryDto {
  const measure = listing.measure;
  const netQuantity = toNumber(listing.netQuantity);
  return {
    id: listing.id,
    chainSlug: listing.chain.slug,
    chainName: listing.chain.name,
    currency: listing.chain.currency,
    externalId: listing.externalId,
    name: listing.rawName,
    brand: listing.rawBrand,
    category: listing.rawCategory,
    url: listing.url,
    imageUrl: listing.imageUrl,
    quantityLabel:
      measure && netQuantity
        ? formatQuantity({
            measure,
            netQuantity,
            packCount: listing.packCount ?? 1,
            isWeighted: listing.isWeighted,
          })
        : null,
    currentPrice: toNumber(listing.currentPrice),
    regularPrice: toNumber(listing.regularPrice),
    unitPrice: toNumber(listing.unitPrice),
    unitLabel: measure
      ? listing.isWeighted
        ? 'кг'
        : UNIT_LABELS[measure]
      : null,
    isOnPromo: listing.isOnPromo,
    inStock: listing.inStock,
    delistedAt: listing.delistedAt?.toISOString() ?? null,
    matchStatus: listing.matchStatus,
    matchMethod: listing.matchMethod,
    matchScore: listing.matchScore,
    productId: listing.variant?.productId ?? null,
    barcodes: listing.barcodes,
    lastSeenAt: listing.lastSeenAt.toISOString(),
  };
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
    error: run.error,
  };
}

function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

function toInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** Query-параметри приходять рядками: "true" / "1" */
function isTrue(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

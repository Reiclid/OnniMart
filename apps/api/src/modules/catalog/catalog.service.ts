import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { listingInclude, toListingDto } from '../monitoring/monitoring.service';
import {
  BarcodeLookupDto,
  MatchingStatusDto,
  PriceRangeDto,
  ProductDetailsDto,
  ProductPageDto,
  ProductsQueryDto,
  ReviewPageDto,
} from './dto/catalog.dto';
import { MatchingClient } from './matching/matching.client';
import { normalizeGtin } from '@repo/matching';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/** Каталог для клієнтів і адмінки: товари, фасування, пропозиції мереж, черга модерації */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingClient,
  ) {}

  async getProducts(query: ProductsQueryDto): Promise<ProductPageDto> {
    const page = Math.max(toInt(query.page) ?? 1, 1);
    const pageSize = clampPageSize(query.pageSize);
    const minChains = isTrue(query.multiChain) ? 2 : 1;
    const q = query.q?.trim();
    const gtin = q && /^\d{8,14}$/.test(q) ? normalizeGtin(q) : null;

    const filters: Prisma.Sql[] = [];
    if (gtin) {
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM barcodes bc JOIN product_variants bv ON bv.id = bc."variantId" WHERE bv."productId" = p.id AND bc.gtin = ${gtin})`,
      );
    } else if (q) {
      const like = `%${q}%`;
      filters.push(Prisma.sql`(p.name ILIKE ${like} OR b.name ILIKE ${like})`);
    }
    if (query.chain) {
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM listings cl JOIN product_variants cv ON cv.id = cl."variantId" JOIN store_chains cc ON cc.id = cl."chainId" WHERE cv."productId" = p.id AND cc.slug = ${query.chain})`,
      );
    }
    const where = filters.length
      ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`
      : Prisma.empty;

    // Агрегація в SQL: Prisma не вміє count(DISTINCT …) у HAVING
    const grouped = Prisma.sql`
      SELECT p.id, p.name, count(DISTINCT l."chainId")::int AS chains, count(l.id)::int AS listings
      FROM products p
      JOIN product_variants v ON v."productId" = p.id
      JOIN listings l ON l."variantId" = v.id
      LEFT JOIN brands b ON b.id = p."brandId"
      ${where}
      GROUP BY p.id
      HAVING count(DISTINCT l."chainId") >= ${minChains}`;

    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        ${grouped}
        ORDER BY chains DESC, listings DESC, p.name
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total FROM (${grouped}) AS t`,
    ]);

    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: {
        brand: { select: { name: true } },
        variants: {
          select: {
            id: true,
            listings: {
              select: {
                currentPrice: true,
                isOnPromo: true,
                chain: { select: { name: true, currency: true } },
              },
            },
          },
        },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return {
      items: rows
        .map((row) => byId.get(row.id))
        .filter((p) => p !== undefined)
        .map((product) => {
          const listings = product.variants.flatMap((v) => v.listings);
          const chains = [...new Set(listings.map((l) => l.chain.name))].sort();
          return {
            id: product.id,
            name: product.name,
            brand: product.brand?.name ?? null,
            variantLabel: product.variantLabel,
            imageUrl: product.imageUrl,
            variantsCount: product.variants.length,
            chainsCount: chains.length,
            listingsCount: listings.length,
            chains,
            prices: priceRanges(
              listings.map((l) => ({
                currency: l.chain.currency,
                price: toNumber(l.currentPrice),
              })),
            ),
            onPromo: listings.some((l) => l.isOnPromo),
          };
        }),
      total,
      page,
      pageSize,
    };
  }

  async getProduct(id: string): Promise<ProductDetailsDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        brand: { select: { name: true } },
        line: {
          include: {
            products: {
              select: { id: true, name: true, variantLabel: true },
              orderBy: { name: 'asc' },
              take: 50,
            },
          },
        },
        variants: {
          include: {
            barcodes: { select: { gtin: true } },
            listings: { include: listingInclude },
          },
        },
      },
    });
    if (!product) throw new NotFoundException(`Товар ${id} не знайдено`);

    return {
      id: product.id,
      name: product.name,
      brand: product.brand?.name ?? null,
      variantLabel: product.variantLabel,
      imageUrl: product.imageUrl,
      line: product.line
        ? {
            id: product.line.id,
            name: product.line.name,
            products: product.line.products,
          }
        : null,
      variants: product.variants
        .map((variant) => ({
          id: variant.id,
          label: variant.label,
          netQuantity: toNumber(variant.netQuantity) ?? 0,
          barcodes: variant.barcodes.map((b) => b.gtin),
          // Ціни різних країн не порівнюємо напряму: групи за валютою
          // (₴, потім €), усередині — від найдешевшої за одиницю
          offers: variant.listings
            .map(toListingDto)
            .sort(
              (a, b) =>
                currencyRank(a.currency) - currencyRank(b.currency) ||
                (a.unitPrice ?? a.currentPrice ?? Infinity) -
                  (b.unitPrice ?? b.currentPrice ?? Infinity),
            ),
        }))
        // Спершу фасування, які є в кількох мережах, далі — за розміром
        .sort(
          (a, b) =>
            b.offers.length - a.offers.length || a.netQuantity - b.netQuantity,
        )
        .map(({ netQuantity: _size, ...variant }) => variant),
    };
  }

  /** Сканер штрихкодів: GTIN → фасування й товар */
  async lookupBarcode(code: string): Promise<BarcodeLookupDto> {
    const gtin = normalizeGtin(code);
    const barcode = gtin
      ? await this.prisma.barcode.findUnique({
          where: { gtin },
          include: { variant: { select: { productId: true } } },
        })
      : null;
    if (!barcode) {
      throw new NotFoundException(`Штрихкод ${code} не знайдено в каталозі`);
    }
    return {
      gtin: barcode.gtin,
      variantId: barcode.variantId,
      productId: barcode.variant.productId,
    };
  }

  async getMatchingStatus(): Promise<MatchingStatusDto> {
    const [
      products,
      unmatched,
      inReview,
      byMethod,
      [{ count: multiChainVariants }],
      state,
    ] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.listing.count({
        where: {
          variantId: null,
          matchCandidates: { none: { status: 'SUGGESTED' } },
        },
      }),
      this.prisma.listing.count({
        where: {
          variantId: null,
          matchCandidates: { some: { status: 'SUGGESTED' } },
        },
      }),
      this.prisma.listing.groupBy({
        by: ['matchMethod'],
        where: { matchMethod: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ count: number }[]>`
          SELECT count(*)::int AS count FROM (
            SELECT "variantId" FROM listings WHERE "variantId" IS NOT NULL
            GROUP BY "variantId" HAVING count(DISTINCT "chainId") >= 2
          ) AS t`,
      this.matching.state(),
    ]);

    return {
      running: state.running,
      lastReport: state.lastReport,
      products,
      multiChainVariants,
      unmatched,
      inReview,
      byMethod: byMethod.map((row) => ({
        method: row.matchMethod!,
        count: row._count._all,
      })),
    };
  }

  async getReviewQueue(
    pageParam?: number,
    sizeParam?: number,
  ): Promise<ReviewPageDto> {
    const page = Math.max(toInt(pageParam) ?? 1, 1);
    const pageSize = clampPageSize(sizeParam ?? 20);
    const where: Prisma.ListingWhereInput = {
      variantId: null,
      matchCandidates: { some: { status: 'SUGGESTED' } },
    };

    const [listings, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        include: {
          ...listingInclude,
          matchCandidates: {
            where: { status: 'SUGGESTED' },
            orderBy: { score: 'desc' },
            include: {
              variant: {
                include: {
                  product: { include: { brand: { select: { name: true } } } },
                  listings: {
                    select: {
                      rawName: true,
                      currentPrice: true,
                      chain: { select: { name: true, currency: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { rawName: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      items: listings.map((listing) => ({
        listing: toListingDto(listing),
        candidates: listing.matchCandidates.map((candidate) => {
          const details = (candidate.details ?? {}) as {
            name?: number;
            barcodeMismatch?: boolean;
          };
          const { variant } = candidate;
          return {
            id: candidate.id,
            score: candidate.score,
            nameScore: details.name ?? null,
            barcodeMismatch: details.barcodeMismatch ?? false,
            variantId: variant.id,
            variantLabel: variant.label,
            productId: variant.productId,
            productName: variant.product.name,
            brand: variant.product.brand?.name ?? null,
            imageUrl: variant.product.imageUrl,
            offers: variant.listings.map((l) => ({
              chainName: l.chain.name,
              name: l.rawName,
              price: toNumber(l.currentPrice),
              currency: l.chain.currency,
            })),
          };
        }),
      })),
      total,
      page,
      pageSize,
    };
  }
}

function priceRanges(
  prices: { currency: string; price: number | null }[],
): PriceRangeDto[] {
  const ranges = new Map<string, PriceRangeDto>();
  for (const { currency, price } of prices) {
    if (price === null) continue;
    const range = ranges.get(currency);
    if (!range) ranges.set(currency, { currency, min: price, max: price });
    else {
      range.min = Math.min(range.min, price);
      range.max = Math.max(range.max, price);
    }
  }
  return [...ranges.values()];
}

const CURRENCY_ORDER = ['UAH', 'EUR', 'PLN', 'USD'];

function currencyRank(currency: string): number {
  const rank = CURRENCY_ORDER.indexOf(currency);
  return rank === -1 ? CURRENCY_ORDER.length : rank;
}

function clampPageSize(value?: number | string): number {
  return Math.min(
    Math.max(toInt(value) ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
}

function toInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function isTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

function toNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

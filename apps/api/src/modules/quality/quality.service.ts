import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QUALITY_LIMITS, QualityRow } from './checks';
import type { QualityReportDto } from './quality.dto';
import { buildReport } from './report';

const JUMPS_LIMIT = 50;
const DUPLICATES_LIMIT = 50;

/** PRD-32 крок 2: графіки якості даних для /admin/quality */
@Injectable()
export class QualityService {
  constructor(private readonly prisma: PrismaService) {}

  async report(filter: {
    country?: string;
    chain?: string;
    group?: string;
  }): Promise<QualityReportDto> {
    const country = filter.country?.toUpperCase() || null;
    const chain = filter.chain || null;
    const [rows, categories, chains, jumps, duplicates] = await Promise.all([
      this.rows(country),
      this.prisma.category.findMany({ select: { slug: true, name: true } }),
      this.prisma.storeChain.findMany({
        where: { listings: { some: { delistedAt: null } } },
        select: { slug: true, name: true, countryCode: true },
        orderBy: [{ countryCode: 'asc' }, { name: 'asc' }],
      }),
      this.jumps(country, chain),
      this.duplicates(country, chain),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      chains: chains.map((c) => ({
        slug: c.slug,
        name: c.name,
        country: c.countryCode,
      })),
      ...buildReport(rows, {
        chain: chain ?? undefined,
        group: filter.group,
        categoryNames: new Map(categories.map((c) => [c.slug, c.name])),
      }),
      jumps,
      duplicates,
    };
  }

  /** Активні картки в наявності з ціною (як у quality:research) */
  private async rows(country: string | null): Promise<QualityRow[]> {
    const rows = await this.prisma.$queryRaw<
      (Omit<QualityRow, 'pack'> & { pack: number | null })[]
    >(Prisma.sql`
      SELECT l.id, c.slug AS chain, c."countryCode" AS country, l."rawName" AS name,
        l.measure::text AS measure, l."netQuantity"::float AS qty, l."packCount" AS pack,
        l."isWeighted" AS weighted, l."currentPrice"::float AS price,
        l."regularPrice"::float AS regular, l."unitPrice"::float AS unit,
        l."variantId", v."productId", cat.slug AS category
      FROM listings l
      JOIN store_chains c ON c.id = l."chainId"
      LEFT JOIN product_variants v ON v.id = l."variantId"
      LEFT JOIN products p ON p.id = v."productId"
      LEFT JOIN categories cat ON cat.id = p."categoryId"
      WHERE l."delistedAt" IS NULL AND l."currentPrice" IS NOT NULL AND l."inStock"
        ${country ? Prisma.sql`AND c."countryCode" = ${country}` : Prisma.empty}`);
    return rows.map((r) => ({ ...r, pack: r.pack ?? 1 }));
  }

  /** Стрибки ціни більше ніж утричі між сусідніми знімками картки */
  private async jumps(country: string | null, chain: string | null) {
    const rows = await this.prisma.$queryRaw<
      {
        listingId: string;
        productId: string | null;
        chain: string;
        name: string;
        prev: number;
        price: number;
        at: Date;
      }[]
    >(Prisma.sql`
      SELECT l.id AS "listingId", v."productId", c.slug AS chain, l."rawName" AS name,
        s.prev::float AS prev, s.price::float AS price, s."capturedAt" AS at
      FROM (
        SELECT "listingId", price, "capturedAt",
          lag(price) OVER (PARTITION BY "listingId" ORDER BY "capturedAt") AS prev
        FROM price_snapshots
      ) s
      JOIN listings l ON l.id = s."listingId"
      JOIN store_chains c ON c.id = l."chainId"
      LEFT JOIN product_variants v ON v.id = l."variantId"
      WHERE s.prev > 0 AND s.price > 0
        AND (s.price / s.prev > ${QUALITY_LIMITS.jump} OR s.prev / s.price > ${QUALITY_LIMITS.jump})
        ${country ? Prisma.sql`AND c."countryCode" = ${country}` : Prisma.empty}
        ${chain ? Prisma.sql`AND c.slug = ${chain}` : Prisma.empty}
      ORDER BY s."capturedAt" DESC
      LIMIT ${JUMPS_LIMIT}`);
    return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
  }

  /** Фасування з кількома активними картками однієї мережі: мережа не продає товар двічі */
  private async duplicates(country: string | null, chain: string | null) {
    return this.prisma.$queryRaw<
      {
        variantId: string;
        productId: string;
        product: string;
        chain: string;
        listings: { id: string; name: string }[];
      }[]
    >(Prisma.sql`
      SELECT v.id AS "variantId", p.id AS "productId", p.name || ' · ' || v.label AS product,
        c.slug AS chain,
        json_agg(json_build_object('id', l.id, 'name', l."rawName") ORDER BY l."rawName") AS listings
      FROM listings l
      JOIN store_chains c ON c.id = l."chainId"
      JOIN product_variants v ON v.id = l."variantId"
      JOIN products p ON p.id = v."productId"
      WHERE l."delistedAt" IS NULL
        ${country ? Prisma.sql`AND c."countryCode" = ${country}` : Prisma.empty}
        ${chain ? Prisma.sql`AND c.slug = ${chain}` : Prisma.empty}
      GROUP BY v.id, p.id, p.name, v.label, c.slug
      HAVING count(*) > 1
      ORDER BY count(*) DESC, p.name
      LIMIT ${DUPLICATES_LIMIT}`);
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { clampPageSize, pageOf } from '../../common/query';
import { brandName, rekeyLineSlug, renameLine } from './brand-edit';
import type {
  BrandDto,
  BrandDuplicateDto,
  BrandPageDto,
} from './dto/brands.dto';
import { MatchingClient } from './matching/matching.client';

/** Від цієї схожості назв (pg_trgm) два бренди — можливі дублікати */
const DUPLICATE_SIMILARITY = 0.6;
const DUPLICATES_LIMIT = 100;

/** Словник брендів для модератора: перегляд, перейменування, злиття дублікатів */
@Injectable()
export class BrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingClient,
  ) {}

  async list(query: {
    search?: string;
    sort?: string;
    page?: unknown;
    pageSize?: unknown;
  }): Promise<BrandPageDto> {
    const page = pageOf(query.page);
    const pageSize = clampPageSize(query.pageSize, 50);
    const search = query.search?.trim();
    const where = search
      ? Prisma.sql`WHERE b.name ILIKE ${`%${search}%`} OR b.slug ILIKE ${`%${search}%`}
          OR EXISTS (SELECT 1 FROM brand_aliases a WHERE a."brandId" = b.id AND a.alias ILIKE ${`%${search}%`})`
      : Prisma.empty;
    const order =
      query.sort === 'name'
        ? Prisma.sql`lower(b.name)`
        : Prisma.sql`products DESC, listings DESC, lower(b.name)`;
    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<BrandDto[]>(Prisma.sql`
        SELECT b.id, b.name, b.slug,
          count(DISTINCT p.id)::int AS products,
          count(DISTINCT l.id)::int AS listings,
          coalesce(array_agg(DISTINCT c.slug) FILTER (WHERE c.slug IS NOT NULL), '{}') AS chains,
          coalesce(array_agg(DISTINCT c."countryCode"::text) FILTER (WHERE c.slug IS NOT NULL), '{}') AS countries,
          coalesce((SELECT array_agg(a.alias ORDER BY a.alias) FROM brand_aliases a
            WHERE a."brandId" = b.id), '{}') AS aliases
        FROM brands b
        LEFT JOIN products p ON p."brandId" = b.id
        LEFT JOIN product_variants v ON v."productId" = p.id
        LEFT JOIN listings l ON l."variantId" = v.id AND l."delistedAt" IS NULL
        LEFT JOIN store_chains c ON c.id = l."chainId"
        ${where}
        GROUP BY b.id
        ORDER BY ${order}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
      this.prisma.$queryRaw<{ n: number }[]>(
        Prisma.sql`SELECT count(*)::int AS n FROM brands b ${where}`,
      ),
    ]);
    return { items: rows, total: total[0].n, page, pageSize };
  }

  /**
   * Можливі дублікати: схожі назви (pg_trgm, індекс brands_name_trgm_idx). Злиття вирішує
   * людина: «UP2FASHION MEN» і «UP2FASHION WOMEN» схожі, але це різні лінійки.
   */
  async duplicates(): Promise<BrandDuplicateDto[]> {
    const [, rows] = await this.prisma.$transaction([
      this.prisma
        .$executeRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(DUPLICATE_SIMILARITY)}, true)`,
      this.prisma.$queryRaw<
        {
          aId: string;
          aName: string;
          aSlug: string;
          aProducts: number;
          bId: string;
          bName: string;
          bSlug: string;
          bProducts: number;
          similarity: number;
        }[]
      >`
        WITH counts AS (
          SELECT b.id, b.name, b.slug, count(p.id)::int AS products
          FROM brands b LEFT JOIN products p ON p."brandId" = b.id
          GROUP BY b.id
        )
        SELECT a.id AS "aId", a.name AS "aName", a.slug AS "aSlug", a.products AS "aProducts",
          b.id AS "bId", b.name AS "bName", b.slug AS "bSlug", b.products AS "bProducts",
          similarity(a.name, b.name)::float AS similarity
        FROM brands x JOIN brands y ON x.name % y.name AND x.slug < y.slug
        JOIN counts a ON a.id = x.id
        JOIN counts b ON b.id = y.id
        ORDER BY similarity DESC, a.products + b.products DESC
        LIMIT ${DUPLICATES_LIMIT}`,
    ]);
    return rows.map((r) => {
      const a = {
        id: r.aId,
        name: r.aName,
        slug: r.aSlug,
        products: r.aProducts,
      };
      const b = {
        id: r.bId,
        name: r.bName,
        slug: r.bSlug,
        products: r.bProducts,
      };
      // Пропонуємо зливати менший бренд у більший
      const [source, target] = a.products > b.products ? [b, a] : [a, b];
      return { source, target, similarity: r.similarity };
    });
  }

  /**
   * Нова назва для показу. Ключ (slug) не змінюється: зіставлення бере ключ товару з
   * Brand.slug (productFeatures), тож перейменування не розриває звʼязок з картками.
   */
  async rename(id: string, value: unknown): Promise<void> {
    const name = brandName(value);
    const brand = await this.find(id);
    if (brand.name === name) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.brand.update({ where: { id }, data: { name } });
      const lines = await tx.productLine.findMany({
        where: { brandId: id },
        select: { id: true, name: true },
      });
      for (const line of lines) {
        const renamed = renameLine(line.name, brand.name, name);
        if (renamed !== line.name) {
          await tx.productLine.update({
            where: { id: line.id },
            data: { name: renamed },
          });
        }
      }
      // Ключі з назви товару прибирають слова бренду за його назвою — syncKeys створить нові
      await tx.matchKey.deleteMany({
        where: { listingId: null, variant: { product: { brandId: id } } },
      });
    });
    // Пакет перебудує ключі й пошуковий індекс (назва бренду — поле пошуку)
    await this.matching.request();
  }

  /**
   * Злиття дубліката в основний бренд: товари й лінійки переходять до основного (лінійки
   * з однаковими словами зливаються), ключ дубліката стає аліасом — нові картки з ним
   * зіставляються з основним брендом, — а сам дублікат видаляється. Не скасовується.
   */
  async merge(sourceId: string, targetId: unknown): Promise<void> {
    if (typeof targetId !== 'string' || !targetId) {
      throw new BadRequestException('Поле «into» — id основного бренду');
    }
    if (sourceId === targetId) {
      throw new BadRequestException('Бренд не можна обʼєднати сам із собою');
    }
    const [source, target] = await Promise.all([
      this.find(sourceId),
      this.find(targetId),
    ]);
    await this.prisma.$transaction(async (tx) => {
      const lines = await tx.productLine.findMany({
        where: { brandId: source.id },
        select: { id: true, slug: true, name: true },
      });
      for (const line of lines) {
        const slug = rekeyLineSlug(line.slug, source.slug, target.slug);
        const existing =
          slug === line.slug
            ? null
            : await tx.productLine.findUnique({
                where: { slug },
                select: { id: true },
              });
        if (existing) {
          await tx.product.updateMany({
            where: { lineId: line.id },
            data: { lineId: existing.id },
          });
          await tx.productLine.delete({ where: { id: line.id } });
        } else {
          await tx.productLine.update({
            where: { id: line.id },
            data: {
              slug,
              name: renameLine(line.name, source.name, target.name),
              brandId: target.id,
            },
          });
        }
      }
      // Ключі товарів містять бренд (b:<ключ>) — syncKeys створить нові з ключем основного
      await tx.matchKey.deleteMany({
        where: { variant: { product: { brandId: source.id } } },
      });
      await tx.product.updateMany({
        where: { brandId: source.id },
        data: { brandId: target.id },
      });
      // Аліаси дубліката тепер ведуть до основного; аліас, рівний ключу основного, зайвий
      await tx.brandAlias.updateMany({
        where: { brandId: source.id },
        data: { brandId: target.id },
      });
      await tx.brandAlias.deleteMany({ where: { alias: target.slug } });
      await tx.brandAlias.create({
        data: { alias: source.slug, brandId: target.id },
      });
      await tx.brand.delete({ where: { id: source.id } });
    });
    await this.matching.request();
  }

  private async find(id: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true },
    });
    if (!brand) throw new NotFoundException('Бренд не знайдено');
    return brand;
  }
}

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { errorText } from '../../common/errors';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { listingInclude, toListingDto } from '../../common/listing.mapper';
import { clampPageSize, isTrue, pageOf, toNumber } from '../../common/query';
import {
  BarcodeLookupDto,
  MatchingStatusDto,
  CategoryDto,
  PriceRangeDto,
  ProductDetailsDto,
  ProductPageDto,
  ProductSummaryDto,
  ProductsQueryDto,
  ReviewPageDto,
} from './dto/catalog.dto';
import { MatchingClient } from './matching/matching.client';
import { OpenFoodFactsClient } from './open-food-facts.client';
import {
  fromOffProduct,
  isRelevantSuggestion,
  rankBrands,
  suggestionQueries,
  type FoodFactsRow,
} from './food-facts';
import { saveFoodFacts } from './food-facts.store';
import { productImages } from './product-images';
import {
  searchEnabled,
  searchFilter,
  searchProductIds,
  withoutBrand,
} from './search/search';

const SIMILAR_LIMIT = 8;
const SUGGESTIONS_LIMIT = 6;
import { conceptLabels, normalizeGtin, queryConcept } from '@repo/matching';

/** Каталог для клієнтів і адмінки: товари, фасування, пропозиції мереж, черга модерації */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingClient,
    private readonly off: OpenFoodFactsClient,
  ) {}

  async getProducts(query: ProductsQueryDto): Promise<ProductPageDto> {
    const page = pageOf(query.page);
    const pageSize = clampPageSize(query.pageSize);
    const { ids, total } = await this.findProductIds(
      query,
      (page - 1) * pageSize,
      pageSize,
    );
    return { items: await this.summaries(ids), total, page, pageSize };
  }

  /**
   * id товарів у базовому порядку: релевантність Meilisearch (з оцінкою 0..1) або популярність
   * (SQL). Країна в каталозі — фільтр, а в пошуку (є `q`) — порядок: спершу товари її мереж,
   * далі решти країн ("хліб" у DE знаходить і український хліб).
   */
  async findProductIds(
    query: Pick<
      ProductsQueryDto,
      'q' | 'category' | 'chain' | 'country' | 'multiChain' | 'onPromo'
    >,
    offset: number,
    limit: number,
  ): Promise<{ ids: string[]; total: number; scores?: number[] }> {
    const minChains = isTrue(query.multiChain) ? 2 : 1;
    const onPromo = isTrue(query.onPromo);
    const q = query.q?.trim();
    const gtin = q && /^\d{8,14}$/.test(q) ? normalizeGtin(q) : null;
    const countryFirst = q ? query.country : undefined;
    const country = q ? undefined : query.country;

    // Текстовий запит — у Meilisearch (помилки в словах, синоніми, латиниця); при збої — SQL
    if (q && !gtin && searchEnabled()) {
      const found = await searchProductIds(
        q,
        searchFilter({
          category: query.category,
          chain: query.chain,
          country,
          minChains,
          onPromo,
        }),
        offset,
        limit,
        undefined,
        queryConcept(q),
        countryFirst ? searchFilter({ country: countryFirst })[0] : null,
      ).catch((error: unknown) => {
        this.logger.warn(
          `Meilisearch недоступний, пошук через SQL: ${errorText(error)}`,
        );
        return null;
      });
      if (found) return found;
    }

    const filters: Prisma.Sql[] = [];
    if (gtin) {
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM barcodes bc JOIN product_variants bv ON bv.id = bc."variantId" WHERE bv."productId" = p.id AND bc.gtin = ${gtin})`,
      );
    } else if (q) {
      // Кожне слово — у назві чи бренді (не підряд: "молоко галичина"); слово-поняття —
      // будь-якою мовою: "молоко" знаходить і Vollmilch
      for (const word of q.split(/\s+/).slice(0, 8)) {
        const concept = queryConcept(word);
        const likes = [word, ...(concept ? conceptLabels(concept) : [])].map(
          (w) => `%${w.replace(/[\\%_]/g, '\\$&')}%`,
        );
        filters.push(
          Prisma.sql`(${Prisma.join(
            likes.map(
              (like) =>
                Prisma.sql`p.name ILIKE ${like} OR b.name ILIKE ${like}`,
            ),
            ' OR ',
          )})`,
        );
      }
    }
    if (query.category) {
      filters.push(
        Prisma.sql`p."categoryId" = (SELECT id FROM categories WHERE slug = ${query.category})`,
      );
    }
    if (query.chain) {
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM listings cl JOIN product_variants cv ON cv.id = cl."variantId" JOIN store_chains cc ON cc.id = cl."chainId" WHERE cv."productId" = p.id AND cl."delistedAt" IS NULL AND cc.slug = ${query.chain})`,
      );
    }
    const inCountry = (code: string) =>
      Prisma.sql`EXISTS (SELECT 1 FROM listings kl JOIN product_variants kv ON kv.id = kl."variantId" JOIN store_chains kc ON kc.id = kl."chainId" WHERE kv."productId" = p.id AND kl."delistedAt" IS NULL AND kc."countryCode" = ${code})`;
    if (country && !onPromo) filters.push(inCountry(country));
    // Акція має бути саме там, де покупець дивиться: у вибраній мережі та країні
    if (onPromo) {
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM listings pl JOIN product_variants pv ON pv.id = pl."variantId" JOIN store_chains pc ON pc.id = pl."chainId" WHERE pv."productId" = p.id AND pl."delistedAt" IS NULL AND pl."isOnPromo" AND pl."inStock"${
          query.chain ? Prisma.sql` AND pc.slug = ${query.chain}` : Prisma.empty
        }${country ? Prisma.sql` AND pc."countryCode" = ${country}` : Prisma.empty})`,
      );
    }
    filters.push(Prisma.sql`s.chains >= ${minChains}`);

    // Лічильники мереж і карток — готові (матеріалізоване подання product_stats,
    // оновлюється після кожного пакета зіставлення), а не GROUP BY на кожен запит
    const from = Prisma.sql`
      FROM product_stats s
      JOIN products p ON p.id = s."productId"
      LEFT JOIN brands b ON b.id = p."brandId"
      WHERE ${Prisma.join(filters, ' AND ')}`;

    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id ${from}
        ORDER BY ${countryFirst ? Prisma.sql`${inCountry(countryFirst)} DESC,` : Prisma.empty}
          s.chains DESC, s.listings DESC, p.name
        LIMIT ${limit} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total ${from}`,
    ]);
    return { ids: rows.map((r) => r.id), total };
  }

  /** Картки товарів у заданому порядку (релевантність пошуку або сортування SQL) */
  async summaries(ids: string[]): Promise<ProductSummaryDto[]> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        brand: { select: { name: true } },
        category: { select: { slug: true } },
        variants: {
          select: {
            id: true,
            listings: {
              where: { delistedAt: null },
              select: {
                currentPrice: true,
                regularPrice: true,
                isOnPromo: true,
                inStock: true,
                chain: { select: { name: true, currency: true } },
              },
            },
          },
        },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return ids
      .map((id) => byId.get(id))
      .filter((p) => p !== undefined)
      .map((product) => {
        const listings = product.variants.flatMap((v) => v.listings);
        const chains = [...new Set(listings.map((l) => l.chain.name))].sort();
        // Ціни й акції — лише того, що є в наявності
        const available = listings.filter((l) => l.inStock);
        return {
          id: product.id,
          name: product.name,
          brand: product.brand?.name ?? null,
          category: product.category?.slug ?? null,
          variantLabel: product.variantLabel,
          imageUrl: product.imageUrl,
          variantsCount: product.variants.length,
          chainsCount: chains.length,
          listingsCount: listings.length,
          chains,
          prices: priceRanges(
            available.map((l) => ({
              currency: l.chain.currency,
              price: toNumber(l.currentPrice),
              chain: l.chain.name,
              regular: l.isOnPromo ? toNumber(l.regularPrice) : null,
            })),
          ),
          onPromo: available.some((l) => l.isOnPromo),
        };
      });
  }

  /**
   * Схожі товари (аналоги): та сама категорія, схожа назва без бренду — "Напій газований"
   * для Coca-Cola знаходить інші газовані напої. Без Meilisearch — популярні в категорії.
   */
  async getSimilar(id: string): Promise<ProductSummaryDto[]> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        name: true,
        lineId: true,
        categoryId: true,
        brand: { select: { name: true } },
        category: { select: { slug: true } },
      },
    });
    if (!product) throw new NotFoundException(`Товар ${id} не знайдено`);
    if (searchEnabled()) {
      const found = await searchProductIds(
        withoutBrand(product.name, product.brand?.name),
        searchFilter({
          category: product.category?.slug,
          excludeId: id,
          excludeLineId: product.lineId,
        }),
        0,
        SIMILAR_LIMIT,
        ['last'],
      ).catch((error: unknown) => {
        this.logger.warn(
          `Meilisearch недоступний, схожі товари з SQL: ${errorText(error)}`,
        );
        return null;
      });
      if (found?.ids.length) return this.summaries(found.ids);
    }
    if (!product.categoryId) return [];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM product_stats s JOIN products p ON p.id = s."productId"
      WHERE p."categoryId" = ${product.categoryId} AND p.id <> ${id}
        AND p."lineId" IS DISTINCT FROM ${product.lineId}
      ORDER BY s.chains DESC, s.listings DESC LIMIT ${SIMILAR_LIMIT}`;
    return this.summaries(rows.map((r) => r.id));
  }

  /** Категорії з кількістю товарів (порожні — теж, щоб меню було стабільним) */
  async getCategories(): Promise<CategoryDto[]> {
    const categories = await this.prisma.category.findMany({
      where: { parentId: null },
      select: {
        slug: true,
        name: true,
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });
    return categories.map(({ _count, ...c }) => ({
      ...c,
      productsCount: _count.products,
    }));
  }

  async getProduct(id: string): Promise<ProductDetailsDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        brand: { select: { name: true } },
        category: { select: { slug: true, name: true } },
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
            listings: { where: { delistedAt: null }, include: listingInclude },
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
      images: productImages(product),
      description: product.description,
      category: product.category,
      categoryLocked: product.categoryLocked,
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
          packaging: variant.packaging,
          imageUrl: variant.imageUrl,
          // Ціни різних країн не порівнюємо напряму: групи за валютою
          // (₴, потім €), усередині — від найдешевшої за одиницю; немає в наявності — в кінці групи
          offers: variant.listings
            .map(toListingDto)
            .sort(
              (a, b) =>
                currencyRank(a.currency) - currencyRank(b.currency) ||
                Number(!a.inStock) - Number(!b.inStock) ||
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

  /**
   * Сканер: штрихкод → товар каталогу. Немає в каталозі (мережі без штрихкодів, як ALDI) —
   * що знає Open Food Facts (food_facts або один запит до API, з кешем) і схожі товари з цінами.
   */
  async lookupBarcode(code: string): Promise<BarcodeLookupDto> {
    const gtin = normalizeGtin(code);
    if (!gtin) throw new BadRequestException(`Некоректний штрихкод: ${code}`);
    const barcode = await this.prisma.barcode.findUnique({ where: { gtin } });
    const facts =
      (await this.prisma.foodFacts.findUnique({ where: { gtin } })) ??
      (barcode ? null : await this.fetchOffFacts(gtin));
    const product = barcode
      ? ((await this.getProducts({ q: gtin, pageSize: 1 })).items[0] ?? null)
      : null;
    const suggestions = product || !facts ? [] : await this.suggestFor(facts);
    return {
      gtin,
      product,
      variantId: barcode?.variantId ?? null,
      facts: facts && {
        name: facts.productName,
        brands: rankBrands(facts.brands, suggestions),
        quantity: facts.quantity,
        imageUrl: facts.imageUrl,
        nutriscore: facts.nutriscore,
      },
      suggestions,
    };
  }

  /** Товар з API Open Food Facts; знайдений — у food_facts, щоб не питати вдруге */
  private async fetchOffFacts(gtin: string): Promise<FoodFactsRow | null> {
    const product = await this.off.product(gtin);
    if (!product) return null;
    const row = fromOffProduct(gtin, product);
    await saveFoodFacts(this.prisma, [row]).catch((error) =>
      this.logger.warn(`food_facts ${gtin}: ${errorText(error)}`),
    );
    return row;
  }

  /** Схожі з цінами: бренд + назва, бренд, назва — поки не набереться SUGGESTIONS_LIMIT */
  private async suggestFor(
    facts: Pick<FoodFactsRow, 'productName' | 'brands'>,
  ): Promise<ProductSummaryDto[]> {
    const found = new Map<string, ProductSummaryDto>();
    for (const q of suggestionQueries(facts)) {
      if (found.size >= SUGGESTIONS_LIMIT) break;
      for (const item of (
        await this.getProducts({ q, pageSize: SUGGESTIONS_LIMIT })
      ).items) {
        if (found.size < SUGGESTIONS_LIMIT && isRelevantSuggestion(facts, item))
          found.set(item.id, item);
      }
    }
    return [...found.values()];
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
            SELECT "variantId" FROM listings WHERE "variantId" IS NOT NULL AND "delistedAt" IS NULL
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
    const page = pageOf(pageParam);
    const pageSize = clampPageSize(sizeParam, 20);
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
                    where: { delistedAt: null },
                    take: 20,
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
        candidates: listing.matchCandidates.flatMap((candidate) => {
          const details = (candidate.details ?? {}) as {
            name?: number;
            barcodeMismatch?: boolean;
          };
          const { variant } = candidate;
          // Фасування видалили (відвʼязування) — пропонувати нічого
          if (!variant) return [];
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

export function priceRanges(
  prices: {
    currency: string;
    price: number | null;
    chain: string;
    /** Звичайна ціна, якщо пропозиція зараз на акції */
    regular: number | null;
  }[],
): PriceRangeDto[] {
  const ranges = new Map<string, PriceRangeDto>();
  for (const { currency, price, chain, regular } of prices) {
    if (price === null) continue;
    const minRegular = regular !== null && regular > price ? regular : null;
    const range = ranges.get(currency);
    if (!range)
      ranges.set(currency, {
        currency,
        min: price,
        max: price,
        minChain: chain,
        minRegular,
      });
    else {
      // За однакової ціни — та, що на акції: картка покаже знижку
      if (
        price < range.min ||
        (price === range.min && minRegular && !range.minRegular)
      )
        Object.assign(range, { min: price, minChain: chain, minRegular });
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

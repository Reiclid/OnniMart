import { Injectable, Logger } from '@nestjs/common';
import {
  buildProfile,
  rankForYou,
  rankSearch,
  topKeys,
  type Candidate,
  type Profile,
} from '@repo/ranking';
import { errorText } from '../../common/errors';
import { clampPageSize, pageOf } from '../../common/query';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MAX_VIEWS, retentionCutoff } from '../activity/activity';
import type { EventName } from '../activity/activity';
import { ActivityService } from '../activity/activity.service';
import { CatalogService } from '../catalog/catalog.service';
import type {
  ProductPageDto,
  ProductSummaryDto,
  ProductsQueryDto,
} from '../catalog/dto/catalog.dto';
import {
  toCandidates,
  toSignals,
  type Action,
  type ProductFacts,
  type UnitPrice,
} from './recommendations';

/** Скільки перших результатів пошуку переставляє ранжувальник; далі — базовий порядок */
const SEARCH_POOL = 300;
const FOR_YOU_LIMIT = 12;
/** Кандидати "Для вас": популярні в кожній з улюблених категорій і просто популярні */
const FOR_YOU_CATEGORIES = 3;
const FOR_YOU_POOL = 60;
const PROFILE_EVENTS = 500;
const PROFILE_SUBSCRIPTIONS = 200;

/**
 * Ранжувальник v0 (AUDIT §9.3) за персональним пошуком і "Для вас". Профіль рахується на запит
 * з переглядів, підписок і подій; покази пишуться в events (лише за згодою) з позицією.
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly activity: ActivityService,
  ) {}

  /**
   * Перші SEARCH_POOL результатів (кратно сторінці) — переставлені за профілем; далі — базовий
   * порядок з того самого місця, тож сторінки не повторюють і не гублять товари.
   */
  async search(
    userId: string,
    sessionId: string,
    query: ProductsQueryDto,
  ): Promise<ProductPageDto> {
    const page = pageOf(query.page);
    const pageSize = clampPageSize(query.pageSize);
    const offset = (page - 1) * pageSize;
    const pool = Math.floor(SEARCH_POOL / pageSize) * pageSize;
    let ids: string[];
    let total: number;
    if (offset >= pool) {
      ({ ids, total } = await this.catalog.findProductIds(
        query,
        offset,
        pageSize,
      ));
    } else {
      const [base, user] = await Promise.all([
        this.catalog.findProductIds(query, 0, pool),
        this.user(userId),
      ]);
      const [candidates, { profile }] = await Promise.all([
        this.candidates(base.ids, query.country ?? user.countryCode),
        this.profile(userId, user.chainIds),
      ]);
      ids = rankSearch(candidates, profile).slice(offset, offset + pageSize);
      total = base.total;
    }
    const q = query.q?.trim();
    this.logShown(userId, sessionId, ids, {
      offset,
      listId: q ? 'search' : 'catalog',
      query: q,
    });
    return { items: await this.catalog.summaries(ids), total, page, pageSize };
  }

  /** "Для вас": улюблені категорії профілю + популярне; без профілю — просто популярне */
  async forYou(
    userId: string,
    sessionId: string,
  ): Promise<ProductSummaryDto[]> {
    const user = await this.user(userId);
    const { profile, tracked } = await this.profile(userId, user.chainIds);
    // Категорії з історії, а поки її мало — з онбордингу (холодний старт)
    const categories = [
      ...new Set([
        ...topKeys(profile.category, FOR_YOU_CATEGORIES),
        ...(user.interests ?? []),
      ]),
    ].slice(0, FOR_YOU_CATEGORIES);
    const pools = await Promise.all(
      [...categories, undefined].map((category) =>
        this.catalog.findProductIds(
          { category, multiChain: true },
          0,
          FOR_YOU_POOL,
        ),
      ),
    );
    const candidates = await this.candidates(
      [...new Set(pools.flatMap((p) => p.ids))],
      user.countryCode,
    );
    const { ids, explored } = rankForYou(candidates, profile, {
      limit: FOR_YOU_LIMIT,
      exclude: tracked,
    });
    this.logShown(userId, sessionId, ids, {
      offset: 0,
      listId: 'for-you',
      explored,
    });
    return this.catalog.summaries(ids);
  }

  private user(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { countryCode: true, chainIds: true, interests: true },
    });
  }

  /** Перегляди (view), підписки (track) і події click / chain_click / favourite за 180 днів */
  private async profile(
    userId: string,
    preferredChains: string[],
  ): Promise<{ profile: Profile; tracked: Set<string> }> {
    const [views, subs, events] = await Promise.all([
      this.prisma.productView.findMany({
        where: { userId },
        orderBy: { viewedAt: 'desc' },
        take: MAX_VIEWS,
        select: { productId: true, viewedAt: true },
      }),
      this.prisma.subscription.findMany({
        where: { userId },
        take: PROFILE_SUBSCRIPTIONS,
        select: {
          productId: true,
          chainIds: true,
          createdAt: true,
          variant: { select: { productId: true } },
        },
      }),
      this.prisma.event.findMany({
        where: {
          userId,
          type: { in: ['CLICK', 'CHAIN_CLICK', 'FAVOURITE'] },
          createdAt: { gte: retentionCutoff(new Date()) },
        },
        orderBy: { createdAt: 'desc' },
        take: PROFILE_EVENTS,
        select: { type: true, productId: true, chainId: true, createdAt: true },
      }),
    ]);
    const actions: Action[] = [
      ...views.map((v) => ({
        type: 'view' as const,
        at: v.viewedAt,
        productId: v.productId,
      })),
      ...subs.map((s) => ({
        type: 'track' as const,
        at: s.createdAt,
        productId: s.variant?.productId ?? s.productId,
        chains: s.chainIds,
      })),
      ...events.map((e) => ({
        type: e.type.toLowerCase() as 'click' | 'chain_click' | 'favourite',
        at: e.createdAt,
        productId: e.productId,
        chains: e.chainId ? [e.chainId] : undefined,
      })),
    ];
    const productIds = [
      ...new Set(actions.flatMap((a) => (a.productId ? [a.productId] : []))),
    ];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        brandId: true,
        category: { select: { slug: true } },
      },
    });
    const signals = toSignals(
      actions,
      new Map(
        products.map((p) => [
          p.id,
          {
            name: p.name,
            brandId: p.brandId,
            category: p.category?.slug ?? null,
          },
        ]),
      ),
    );
    return {
      profile: buildProfile(signals, new Date(), preferredChains),
      tracked: new Set(
        subs
          .map((s) => s.variant?.productId ?? s.productId)
          .filter((id) => id !== null),
      ),
    };
  }

  /** Ознаки кандидатів двома запитами: мережі, країни, знижка; найнижча ціна за одиницю */
  private async candidates(
    ids: string[],
    country: string | null,
  ): Promise<Candidate[]> {
    if (!ids.length) return [];
    const list = Prisma.join(ids);
    const [facts, prices] = await Promise.all([
      this.prisma.$queryRaw<ProductFacts[]>`
        SELECT p.id, p.name, p."lineId", p."brandId", c.slug AS category,
          coalesce(array_agg(DISTINCT l."chainId") FILTER (WHERE l.id IS NOT NULL), '{}') AS chains,
          coalesce(array_agg(DISTINCT sc."countryCode"::text) FILTER (WHERE l.id IS NOT NULL), '{}') AS countries,
          coalesce(max(1 - l."currentPrice" / l."regularPrice")
            FILTER (WHERE l."isOnPromo" AND l."regularPrice" > l."currentPrice"), 0)::float AS discount
        FROM products p
        LEFT JOIN categories c ON c.id = p."categoryId"
        LEFT JOIN product_variants v ON v."productId" = p.id
        LEFT JOIN listings l ON l."variantId" = v.id
          AND l."delistedAt" IS NULL AND l."currentPrice" IS NOT NULL
        LEFT JOIN store_chains sc ON sc.id = l."chainId"
        WHERE p.id IN (${list})
        GROUP BY p.id, c.slug`,
      this.prisma.$queryRaw<UnitPrice[]>`
        SELECT v."productId" AS id, sc.currency::text AS currency,
          min(l."currentPrice" / (v."netQuantity" * v."packCount"))::float AS price
        FROM product_variants v
        JOIN listings l ON l."variantId" = v.id
          AND l."delistedAt" IS NULL AND l."currentPrice" IS NOT NULL
        JOIN store_chains sc ON sc.id = l."chainId"
        WHERE v."productId" IN (${list}) AND v."netQuantity" > 0 AND NOT v."isWeighted"
        GROUP BY v."productId", sc.currency`,
    ]);
    return toCandidates(ids, facts, prices, country);
  }

  /** Покази з позицією (+ сам запит на першій сторінці); не гальмують відповідь */
  private logShown(
    userId: string,
    sessionId: string,
    ids: string[],
    list: {
      offset: number;
      listId: string;
      query?: string;
      explored?: Set<string>;
    },
  ): void {
    const events: {
      type: EventName;
      productId?: string;
      position?: number;
      listId: string;
      query?: string;
    }[] = ids.map((productId, i) => ({
      type: 'impression',
      productId,
      position: list.offset + i,
      listId: list.explored?.has(productId)
        ? `${list.listId}-explore`
        : list.listId,
      query: list.query,
    }));
    if (list.query && list.offset === 0)
      events.push({ type: 'search', listId: list.listId, query: list.query });
    if (!events.length) return;
    void this.activity
      .track({ userId }, { sessionId, events })
      .catch((error: unknown) => {
        this.logger.warn(`Покази не записано: ${errorText(error)}`);
      });
  }
}

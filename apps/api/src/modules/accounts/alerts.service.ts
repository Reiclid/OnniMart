import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import type { ProductSummaryDto } from '../catalog/dto/catalog.dto';
import { interleave, topCategories } from './recommendations';
import { AlertOffer, relevantOffers } from './alerts';
import type {
  CreateSubscriptionDto,
  NotificationDto,
  SubscriptionDto,
  UpdateSubscriptionDto,
} from './dto/accounts.dto';

const LISTINGS = {
  where: { delistedAt: null, currentPrice: { not: null } },
  select: {
    id: true,
    chainId: true,
    currentPrice: true,
    regularPrice: true,
    isOnPromo: true,
    chain: { select: { name: true, currency: true } },
  },
} satisfies Prisma.ListingFindManyArgs;

/** Підписка з усім, що треба для ціни: картки фасування або всіх фасувань товару */
export const SUBSCRIPTION_INCLUDE = {
  product: {
    select: {
      id: true,
      name: true,
      imageUrl: true,
      variants: { select: { listings: LISTINGS } },
    },
  },
  variant: {
    select: {
      label: true,
      listings: LISTINGS,
      product: { select: { id: true, name: true, imageUrl: true } },
    },
  },
} satisfies Prisma.SubscriptionInclude;

export type SubscriptionWithOffers = Prisma.SubscriptionGetPayload<{
  include: typeof SUBSCRIPTION_INCLUDE;
}>;

export function offersOf(sub: SubscriptionWithOffers): AlertOffer[] {
  const listings =
    sub.variant?.listings ??
    sub.product?.variants.flatMap((v) => v.listings) ??
    [];
  return listings.map((l) => ({
    listingId: l.id,
    chainId: l.chainId,
    chainName: l.chain.name,
    currency: l.chain.currency,
    price: Number(l.currentPrice),
    regularPrice: l.regularPrice === null ? null : Number(l.regularPrice),
    isOnPromo: l.isOnPromo,
  }));
}

export function subscriptionTitle(sub: SubscriptionWithOffers): string {
  return sub.variant
    ? `${sub.variant.product.name} · ${sub.variant.label}`
    : (sub.product?.name ?? '');
}

const MAX_SUBSCRIPTIONS = 200;

/** Підписки на ціну й сповіщення користувача */
@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  /**
   * "For you": популярні товари (у найбільшій кількості мереж) з категорій, за якими
   * користувач стежить; без підписок — просто популярні.
   */
  async recommendations(
    userId: string,
    limit = 12,
  ): Promise<ProductSummaryDto[]> {
    const subs = await this.prisma.subscription.findMany({
      where: { userId },
      select: {
        product: { select: { id: true, category: { select: { slug: true } } } },
        variant: {
          select: {
            product: {
              select: { id: true, category: { select: { slug: true } } },
            },
          },
        },
      },
      take: MAX_SUBSCRIPTIONS,
    });
    const products = subs
      .map((s) => s.variant?.product ?? s.product)
      .filter((p) => p !== null);
    const categories = topCategories(
      products.map((p) => p.category?.slug ?? null),
    );
    const pools = await Promise.all(
      (categories.length ? categories : [undefined]).map(
        async (category) =>
          (
            await this.catalog.getProducts({
              category,
              multiChain: true,
              pageSize: limit + products.length,
            })
          ).items,
      ),
    );
    return interleave(pools, new Set(products.map((p) => p.id)), limit);
  }

  async list(userId: string): Promise<SubscriptionDto[]> {
    const subs = await this.prisma.subscription.findMany({
      where: { userId },
      include: SUBSCRIPTION_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: MAX_SUBSCRIPTIONS,
    });
    return subs.map(toSubscriptionDto);
  }

  async create(
    userId: string,
    dto: CreateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    if (!dto.productId === !dto.variantId) {
      throw new BadRequestException(
        'Потрібно рівно одне з полів: productId або variantId',
      );
    }
    const target = dto.variantId
      ? await this.prisma.productVariant.findUnique({
          where: { id: dto.variantId },
          select: { id: true },
        })
      : await this.prisma.product.findUnique({
          where: { id: dto.productId },
          select: { id: true },
        });
    if (!target) throw new NotFoundException('Товар не знайдено');

    const fields = {
      targetPrice: dto.targetPrice ?? null,
      notifyOnPromo: dto.notifyOnPromo ?? true,
      // Без явного списку — улюблені мережі з налаштувань
      chainIds:
        dto.chainIds ??
        (
          await this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: { chainIds: true },
          })
        ).chainIds,
      isActive: true,
    };
    // Повторне «Стежити» за тим самим товаром оновлює умови, а не дублює підписку
    const sub = dto.variantId
      ? await this.prisma.subscription.upsert({
          where: { userId_variantId: { userId, variantId: dto.variantId } },
          create: { userId, variantId: dto.variantId, ...fields },
          update: fields,
          include: SUBSCRIPTION_INCLUDE,
        })
      : await this.prisma.subscription.upsert({
          where: { userId_productId: { userId, productId: dto.productId! } },
          create: { userId, productId: dto.productId, ...fields },
          update: fields,
          include: SUBSCRIPTION_INCLUDE,
        });
    return toSubscriptionDto(sub);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    await this.own(userId, id);
    const sub = await this.prisma.subscription.update({
      where: { id },
      data: dto,
      include: SUBSCRIPTION_INCLUDE,
    });
    return toSubscriptionDto(sub);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.own(userId, id);
    await this.prisma.subscription.delete({ where: { id } });
  }

  async notifications(userId: string): Promise<NotificationDto[]> {
    const items = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      productId:
        (n.payload as { productId?: string } | null)?.productId ?? null,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt?.toISOString() ?? null,
    }));
  }

  async markRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /** Чужа або неіснуюча підписка — однаково 404 */
  private async own(userId: string, id: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!sub) throw new NotFoundException('Підписку не знайдено');
  }
}

function toSubscriptionDto(sub: SubscriptionWithOffers): SubscriptionDto {
  const cheapest = relevantOffers(offersOf(sub), sub.chainIds)[0];
  return {
    id: sub.id,
    productId: sub.variant?.product.id ?? sub.product?.id ?? '',
    variantId: sub.variantId,
    title: subscriptionTitle(sub),
    imageUrl: sub.variant?.product.imageUrl ?? sub.product?.imageUrl ?? null,
    targetPrice: sub.targetPrice === null ? null : Number(sub.targetPrice),
    notifyOnPromo: sub.notifyOnPromo,
    isActive: sub.isActive,
    chainIds: sub.chainIds,
    lowest: cheapest
      ? {
          price: cheapest.price,
          currency: cheapest.currency,
          chainName: cheapest.chainName,
        }
      : null,
    createdAt: sub.createdAt.toISOString(),
  };
}

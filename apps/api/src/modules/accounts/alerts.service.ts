import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';
import { AlertOffer, PriceContext, relevantOffers } from './alerts';
import type {
  CreateSubscriptionDto,
  NotificationDto,
  SubscriptionDto,
  UpdateSubscriptionDto,
} from './dto/accounts.dto';

const LISTINGS = {
  // Немає в наявності — не пропозиція: «ціна досягла цілі» на відсутній товар лише дратує
  where: { delistedAt: null, inStock: true, currentPrice: { not: null } },
  select: {
    id: true,
    chainId: true,
    currentPrice: true,
    regularPrice: true,
    isOnPromo: true,
    chain: { select: { name: true, currency: true, countryCode: true } },
    // Історія змінна лише при зміні ціни: останній знімок — початок поточної ціни
    priceSnapshots: {
      orderBy: { capturedAt: 'desc' },
      take: 1,
      select: { capturedAt: true },
    },
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
    country: l.chain.countryCode,
    currency: l.chain.currency,
    price: Number(l.currentPrice),
    regularPrice: l.regularPrice === null ? null : Number(l.regularPrice),
    isOnPromo: l.isOnPromo,
    priceSince: l.priceSnapshots[0]?.capturedAt,
  }));
}

export function subscriptionTitle(sub: SubscriptionWithOffers): string {
  return sub.variant
    ? `${sub.variant.product.name} · ${sub.variant.label}`
    : (sub.product?.name ?? '');
}

const MAX_SUBSCRIPTIONS = 200;

/** Як порівнювати ціни підписки: її валюта, країна власника, поточні курси */
export const priceContext = (
  sub: { currency: string | null },
  country: string | null,
  perEur: Record<string, number> | null,
): PriceContext => ({ currency: sub.currency, country, perEur });

/** Підписки на ціну й сповіщення користувача */
@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RatesService,
  ) {}

  async list(userId: string): Promise<SubscriptionDto[]> {
    const [subs, toDto] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { userId },
        include: SUBSCRIPTION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: MAX_SUBSCRIPTIONS,
      }),
      this.mapper(userId),
    ]);
    return subs.map(toDto);
  }

  /** SubscriptionDto з найдешевшою пропозицією за правилами сповіщень (валюта, країна) */
  private async mapper(userId: string) {
    const [user, rates] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { countryCode: true },
      }),
      this.rates.current(),
    ]);
    return (sub: SubscriptionWithOffers) =>
      toSubscriptionDto(
        sub,
        priceContext(sub, user.countryCode, rates?.perEur ?? null),
      );
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
      currency: dto.currency ?? null,
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
    return (await this.mapper(userId))(sub);
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
    return (await this.mapper(userId))(sub);
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

function toSubscriptionDto(
  sub: SubscriptionWithOffers,
  ctx: PriceContext,
): SubscriptionDto {
  const cheapest = relevantOffers(offersOf(sub), sub.chainIds, ctx)[0];
  return {
    id: sub.id,
    productId: sub.variant?.product.id ?? sub.product?.id ?? '',
    variantId: sub.variantId,
    title: subscriptionTitle(sub),
    imageUrl: sub.variant?.product.imageUrl ?? sub.product?.imageUrl ?? null,
    targetPrice: sub.targetPrice === null ? null : Number(sub.targetPrice),
    currency: sub.currency,
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

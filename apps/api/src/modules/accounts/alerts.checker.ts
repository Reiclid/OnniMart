import { Injectable, Logger } from '@nestjs/common';
import { withFields } from '../../logger';
import { PrismaService } from '../../prisma/prisma.service';
import { decideAlert, discountOf } from './alerts';
import {
  offersOf,
  SUBSCRIPTION_INCLUDE,
  subscriptionTitle,
} from './alerts.service';

/**
 * Воркер: порівнює поточні ціни з підписками й записує сповіщення в застосунок.
 * Push і email — коли підключимо провайдерів; канал зараз IN_APP.
 */
@Injectable()
export class AlertsChecker {
  private readonly logger = new Logger(AlertsChecker.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<number> {
    // shortcut: усі активні підписки за раз; при тисячах користувачів — лише товари, чия ціна змінилась
    const subs = await this.prisma.subscription.findMany({
      where: { isActive: true },
      include: {
        ...SUBSCRIPTION_INCLUDE,
        user: { select: { minDiscount: true } },
      },
    });
    const data = subs.flatMap((sub) => {
      const alert = decideAlert(
        {
          id: sub.id,
          targetPrice:
            sub.targetPrice === null ? null : Number(sub.targetPrice),
          notifyOnPromo: sub.notifyOnPromo,
          chainIds: sub.chainIds,
        },
        offersOf(sub),
        sub.user.minDiscount,
      );
      if (!alert) return [];
      const { offer } = alert;
      const price = `${offer.price.toFixed(2)} ${offer.currency}`;
      return [
        {
          userId: sub.userId,
          type: alert.type,
          channel: 'IN_APP' as const,
          title: `${subscriptionTitle(sub)}: ${price} at ${offer.chainName}`,
          body:
            alert.type === 'TARGET_PRICE_REACHED'
              ? `Below your target ${Number(sub.targetPrice).toFixed(2)} ${offer.currency}`
              : `−${discountOf(offer)}% promo`,
          payload: {
            productId: sub.variant?.product.id ?? sub.productId,
            variantId: sub.variantId,
            listingId: offer.listingId,
            price: offer.price,
            currency: offer.currency,
            chain: offer.chainName,
          },
          dedupeKey: alert.dedupeKey,
        },
      ];
    });
    const { count } = await this.prisma.notification.createMany({
      data,
      skipDuplicates: true,
    });
    if (count > 0)
      this.logger.log(
        withFields('Нові сповіщення', { count, subscriptions: subs.length }),
      );
    return count;
  }
}

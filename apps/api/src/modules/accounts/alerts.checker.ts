import { Injectable, Logger } from '@nestjs/common';
import { withFields } from '../../logger';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { RatesService } from '../rates/rates.service';
import { decideAlert, discountOf } from './alerts';
import {
  offersOf,
  priceContext,
  SUBSCRIPTION_INCLUDE,
  subscriptionTitle,
} from './alerts.service';

/**
 * Воркер: порівнює поточні ціни з підписками, записує сповіщення в застосунок
 * і шле нові на телефони покупця (Web Push, якщо notifyPush). Email — пізніше.
 */
@Injectable()
export class AlertsChecker {
  private readonly logger = new Logger(AlertsChecker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RatesService,
    private readonly push: PushService,
  ) {}

  async check(): Promise<number> {
    // shortcut: усі активні підписки за раз; при тисячах користувачів — лише товари, чия ціна змінилась
    const [subs, rates] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { isActive: true },
        include: {
          ...SUBSCRIPTION_INCLUDE,
          user: {
            select: { minDiscount: true, countryCode: true, notifyPush: true },
          },
        },
      }),
      this.rates.current(),
    ]);
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
        priceContext(sub, sub.user.countryCode, rates?.perEur ?? null),
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
              ? `Below your target ${Number(sub.targetPrice).toFixed(2)} ${sub.currency ?? offer.currency}`
              : `−${discountOf(offer)}% promo`,
          // Дані для тексту мовою покупця (веб, notificationParams); title/body — запасний текст
          payload: {
            productId: sub.variant?.product.id ?? sub.productId,
            variantId: sub.variantId,
            listingId: offer.listingId,
            product: subscriptionTitle(sub),
            price: offer.price,
            currency: offer.currency,
            chain: offer.chainName,
            target: sub.targetPrice === null ? null : Number(sub.targetPrice),
            targetCurrency: sub.currency ?? offer.currency,
            discount: discountOf(offer),
          },
          dedupeKey: alert.dedupeKey,
        },
      ];
    });
    // Повертаються лише нові: дублікати (той самий dedupeKey) пропущено
    const created = await this.prisma.notification.createManyAndReturn({
      data,
      skipDuplicates: true,
      select: {
        id: true,
        userId: true,
        title: true,
        body: true,
        payload: true,
      },
    });
    const count = created.length;
    const pushTo = new Set(
      subs.filter((s) => s.user.notifyPush).map((s) => s.userId),
    );
    const sent: string[] = [];
    for (const n of created.filter((n) => pushTo.has(n.userId))) {
      const productId = (n.payload as { productId?: string } | null)?.productId;
      const delivered = await this.push.send(n.userId, {
        title: n.title,
        body: n.body,
        url: productId ? `/products/${productId}` : '/alerts',
        tag: n.id,
      });
      if (delivered > 0) sent.push(n.id);
    }
    if (sent.length > 0) {
      await this.prisma.notification.updateMany({
        where: { id: { in: sent } },
        data: { sentAt: new Date() },
      });
    }
    if (count > 0)
      this.logger.log(
        withFields('Нові сповіщення', {
          count,
          pushed: sent.length,
          subscriptions: subs.length,
        }),
      );
    return count;
  }
}

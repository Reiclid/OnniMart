import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PriceHistoryDto } from './dto/catalog.dto';
import {
  LOW_DAYS,
  priceStats,
  seriesPoints,
  windowOf,
  type ListingHistory,
} from './price-history';

const DAY_MS = 24 * 60 * 60 * 1000;

/** PRD-02: графік цін фасування по мережах і статистика (30-денний мінімум, розкид, «найнижча за N днів») */
@Injectable()
export class PriceHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async history(
    productId: string,
    variantId: string,
    daysParam?: number,
  ): Promise<PriceHistoryDto> {
    const days = windowOf(daysParam);
    const now = new Date();
    const from = new Date(now.getTime() - Math.max(days, LOW_DAYS) * DAY_MS);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
      select: {
        listings: {
          where: { delistedAt: null },
          select: {
            id: true,
            lastSeenAt: true,
            chain: { select: { name: true, currency: true } },
            // Зміни у вікні; знімок до вікна — окремо нижче (ціна на його початок)
            priceSnapshots: {
              where: { capturedAt: { gte: from }, storeId: null },
              orderBy: { capturedAt: 'asc' },
              select: { price: true, capturedAt: true },
            },
          },
        },
      },
    });
    if (!variant) throw new NotFoundException('Фасування не знайдено');
    const listings: ListingHistory[] = await Promise.all(
      variant.listings.map(async (l) => {
        const before = await this.prisma.priceSnapshot.findFirst({
          where: { listingId: l.id, capturedAt: { lt: from }, storeId: null },
          orderBy: { capturedAt: 'desc' },
          select: { price: true, capturedAt: true },
        });
        return {
          listingId: l.id,
          chainName: l.chain.name,
          currency: l.chain.currency,
          lastSeenAt: l.lastSeenAt,
          snapshots: [...(before ? [before] : []), ...l.priceSnapshots].map(
            (s) => ({ price: Number(s.price), at: s.capturedAt }),
          ),
        };
      }),
    );
    const windowFrom = new Date(now.getTime() - days * DAY_MS);
    return {
      variantId,
      days,
      series: listings
        .filter((l) => l.snapshots.length)
        .map((l) => ({
          listingId: l.listingId,
          chainName: l.chainName,
          currency: l.currency,
          // Кінець ряду — останній огляд картки: після нього ціна невідома
          points: seriesPoints(
            l.snapshots,
            windowFrom,
            l.lastSeenAt && l.lastSeenAt < now ? l.lastSeenAt : now,
            !!l.lastSeenAt,
          ).map((p) => ({
            at: p.at.toISOString(),
            price: p.price,
            observed: p.observed,
          })),
        })),
      stats: priceStats(listings, now),
    };
  }
}

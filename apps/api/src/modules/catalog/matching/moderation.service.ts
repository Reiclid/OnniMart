import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MatchingClient } from './matching.client';

/** Рішення модератора щодо кандидатів зіставлення (черга /matching) */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingClient,
  ) {}

  /** Модератор підтвердив кандидата */
  async acceptCandidate(candidateId: string): Promise<void> {
    const candidate = await this.prisma.matchCandidate.findUnique({
      where: { id: candidateId },
      include: { listing: { include: { chain: { select: { slug: true } } } } },
    });
    if (!candidate) throw new NotFoundException('Кандидата не знайдено');
    // Застаріла вкладка модератора: рішення вже ухвалено або картку вже зіставлено
    const variantId = candidate.variantId;
    if (
      candidate.status !== 'SUGGESTED' ||
      !variantId ||
      candidate.listing.variantId
    ) {
      throw new ConflictException(
        'Кандидат уже неактуальний — оновіть сторінку',
      );
    }
    // Штрихкод картки вже належить іншому фасуванню: підтвердження суперечило б йому
    const foreign = await this.prisma.barcode.findMany({
      where: {
        gtin: { in: candidate.listing.barcodes },
        variantId: { not: variantId },
      },
      select: {
        gtin: true,
        variant: { select: { product: { select: { name: true } } } },
      },
    });
    if (foreign.length > 0) {
      throw new ConflictException(
        `Штрихкод ${foreign[0].gtin} уже належить товару «${foreign[0].variant.product.name}» — можливо, це дублікат у каталозі`,
      );
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.matchCandidate.update({
        where: { id: candidate.id },
        data: { status: 'ACCEPTED', decidedAt: now },
      }),
      this.prisma.matchCandidate.updateMany({
        where: {
          listingId: candidate.listingId,
          id: { not: candidate.id },
          status: 'SUGGESTED',
        },
        data: { status: 'REJECTED', decidedAt: now },
      }),
      this.prisma.listing.update({
        where: { id: candidate.listingId },
        data: {
          variantId,
          matchStatus: 'CONFIRMED',
          matchMethod: 'MANUAL',
          matchScore: candidate.score,
          matchedAt: now,
        },
      }),
      this.prisma.barcode.createMany({
        data: candidate.listing.barcodes.map((gtin) => ({
          gtin,
          variantId,
          source: candidate.listing.chain.slug,
        })),
        skipDuplicates: true,
      }),
    ]);
    // Воркер допише ключі пошуку з назви цієї картки (match_keys)
    await this.matching.request();
  }

  /** Модератор відхилив усіх кандидатів — картка стане окремим товаром */
  async rejectCandidates(listingId: string): Promise<void> {
    const { count } = await this.prisma.matchCandidate.updateMany({
      where: { listingId, status: 'SUGGESTED' },
      data: { status: 'REJECTED', decidedAt: new Date() },
    });
    if (count === 0)
      throw new NotFoundException('Немає кандидатів для цієї картки');
    await this.matching.request();
  }

  /**
   * Картку зіставлено помилково: відвʼязуємо, запамʼятовуємо пару як відхилену
   * і зіставляємо заново. Порожні товар і фасування видаляємо.
   */
  async unlink(listingId: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Картку не знайдено');
    const variantId = listing.variantId;
    if (!variantId) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.matchCandidate.upsert({
        where: { listingId_variantId: { listingId, variantId } },
        create: {
          listingId,
          variantId,
          score: listing.matchScore ?? 0,
          status: 'REJECTED',
          decidedAt: new Date(),
          details: { reason: 'unlinked' },
        },
        update: { status: 'REJECTED', decidedAt: new Date() },
      });
      // Ключі з назви картки належали старому фасуванню
      await tx.matchKey.deleteMany({ where: { listingId } });
      await tx.listing.update({
        where: { id: listingId },
        data: {
          variantId: null,
          matchStatus: 'PENDING',
          matchMethod: null,
          matchScore: null,
          matchedAt: null,
        },
      });
      const left = await tx.listing.count({ where: { variantId } });
      // Порожнє фасування видаляємо, лише якщо на нього ніхто не підписаний
      const subscribed = await tx.subscription.count({ where: { variantId } });
      if (left === 0 && subscribed === 0) {
        // Пропозиції цього фасування ще не рішення — картки зіставляться заново;
        // ACCEPTED / REJECTED лишаються (variantId → null) як розмічені дані
        await tx.matchCandidate.deleteMany({
          where: { variantId, status: 'SUGGESTED' },
        });
        const variant = await tx.productVariant.delete({
          where: { id: variantId },
        });
        const [variants, productSubscriptions] = await Promise.all([
          tx.productVariant.count({ where: { productId: variant.productId } }),
          tx.subscription.count({ where: { productId: variant.productId } }),
        ]);
        if (variants === 0 && productSubscriptions === 0) {
          await tx.product.delete({ where: { id: variant.productId } });
        }
      }
    });
    await this.matching.request();
  }
}

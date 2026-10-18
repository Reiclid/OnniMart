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
    if (candidate.status !== 'SUGGESTED' || candidate.listing.variantId) {
      throw new ConflictException(
        'Кандидат уже неактуальний — оновіть сторінку',
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
          variantId: candidate.variantId,
          matchStatus: 'CONFIRMED',
          matchMethod: 'MANUAL',
          matchScore: candidate.score,
          matchedAt: now,
        },
      }),
      this.prisma.barcode.createMany({
        data: candidate.listing.barcodes.map((gtin) => ({
          gtin,
          variantId: candidate.variantId,
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
      if (left === 0) {
        const variant = await tx.productVariant.delete({
          where: { id: variantId },
        });
        const variants = await tx.productVariant.count({
          where: { productId: variant.productId },
        });
        if (variants === 0) {
          await tx.product.delete({ where: { id: variant.productId } });
        }
      }
    });
    await this.matching.request();
  }
}

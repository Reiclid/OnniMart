import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { clampPageSize, pageOf } from '../../../common/query';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DecisionPageDto } from '../dto/catalog.dto';
import { REVIEWED_SOURCE } from './barcode-review.service';
import { MatchingClient } from './matching.client';
import { removeIfEmpty } from './moderation.service';

export type DecisionKind = 'match' | 'barcode';

const DECIDED = ['ACCEPTED', 'REJECTED'] as const;

/**
 * Журнал рішень модераторів (черги /admin/matching і /admin/barcodes) і їх скасування:
 * картка або фасування повертається в чергу з тими самими кандидатами.
 */
@Injectable()
export class DecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingClient,
  ) {}

  async list(
    kind: DecisionKind,
    pageParam?: number,
    sizeParam?: number,
  ): Promise<DecisionPageDto> {
    const page = pageOf(pageParam);
    const pageSize = clampPageSize(sizeParam, 30);
    const skip = (page - 1) * pageSize;
    const productSelect = {
      id: true,
      name: true,
      imageUrl: true,
      brand: { select: { name: true } },
    };

    if (kind === 'barcode') {
      const where = { status: { in: [...DECIDED] }, decidedAt: { not: null } };
      const [rows, total] = await Promise.all([
        this.prisma.barcodeCandidate.findMany({
          where,
          orderBy: { decidedAt: 'desc' },
          skip,
          take: pageSize,
          include: {
            variant: {
              select: { label: true, product: { select: productSelect } },
            },
          },
        }),
        this.prisma.barcodeCandidate.count({ where }),
      ]);
      return {
        items: rows.map((r) => ({
          id: r.id,
          kind,
          status: r.status,
          unlinked: false,
          decidedAt: r.decidedAt!.toISOString(),
          score: r.score,
          listing: null,
          product: {
            id: r.variant.product.id,
            name: r.variant.product.name,
            brand: r.variant.product.brand?.name ?? null,
            variantLabel: r.variant.label,
            imageUrl: r.variant.product.imageUrl,
          },
          gtin: r.gtin,
          offName: r.offName,
        })),
        total,
        page,
        pageSize,
      };
    }

    const where = { status: { in: [...DECIDED] }, decidedAt: { not: null } };
    const [rows, total] = await Promise.all([
      this.prisma.matchCandidate.findMany({
        where,
        orderBy: { decidedAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          listing: {
            select: {
              id: true,
              rawName: true,
              imageUrl: true,
              currentPrice: true,
              chain: { select: { name: true, currency: true } },
            },
          },
          variant: {
            select: { label: true, product: { select: productSelect } },
          },
        },
      }),
      this.prisma.matchCandidate.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        kind,
        status: r.status,
        // «Відвʼязано» на сторінці товару — теж відхилення, але скасовується повторним зіставленням
        unlinked:
          (r.details as { reason?: string } | null)?.reason === 'unlinked',
        decidedAt: r.decidedAt!.toISOString(),
        score: r.score,
        listing: {
          id: r.listing.id,
          name: r.listing.rawName,
          chainName: r.listing.chain.name,
          imageUrl: r.listing.imageUrl,
          price:
            r.listing.currentPrice === null
              ? null
              : Number(r.listing.currentPrice),
          currency: r.listing.chain.currency,
        },
        product: r.variant
          ? {
              id: r.variant.product.id,
              name: r.variant.product.name,
              brand: r.variant.product.brand?.name ?? null,
              variantLabel: r.variant.label,
              imageUrl: r.variant.product.imageUrl,
            }
          : null,
        gtin: null,
        offName: null,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Скасувати рішення щодо картки: кандидати рішення знову «запропоновано», картка відвʼязана
   * від товару (порожній товар, створений після відхилення, видаляється) — і знову в черзі
   */
  async undoMatch(candidateId: string): Promise<void> {
    const candidate = await this.prisma.matchCandidate.findUnique({
      where: { id: candidateId },
      include: {
        listing: {
          select: {
            id: true,
            variantId: true,
            matchMethod: true,
            barcodes: true,
            chain: { select: { slug: true } },
          },
        },
      },
    });
    if (!candidate) throw new NotFoundException('Рішення не знайдено');
    if (candidate.status === 'SUGGESTED' || !candidate.decidedAt)
      throw new ConflictException('Рішення вже скасовано — оновіть сторінку');
    if (
      (candidate.details as { reason?: string } | null)?.reason === 'unlinked'
    )
      throw new ConflictException(
        'Відвʼязування скасовується на сторінці картки: зіставте її заново',
      );
    const { listing } = candidate;
    // Усі кандидати, вирішені тим самим натисканням (прийняти одного = відхилити решту)
    const group = await this.prisma.matchCandidate.findMany({
      where: {
        listingId: listing.id,
        decidedAt: candidate.decidedAt,
        status: { in: [...DECIDED] },
        variantId: { not: null },
      },
      select: { id: true, status: true, variantId: true },
    });
    const accepted = group.find((c) => c.status === 'ACCEPTED');
    if (accepted) {
      if (listing.variantId !== accepted.variantId)
        throw new ConflictException(
          'Картку вже перезіставлено — скасування неможливе',
        );
    } else {
      if (!group.length)
        throw new ConflictException(
          'Товарів-кандидатів більше немає — повертати нікуди',
        );
      if (listing.matchMethod === 'MANUAL')
        throw new ConflictException(
          'Картку згодом підтвердили з іншим товаром — спершу скасуйте те рішення',
        );
    }

    const linkedTo = listing.variantId;
    await this.prisma.$transaction(async (tx) => {
      await tx.matchCandidate.updateMany({
        where: { id: { in: group.map((c) => c.id) } },
        data: { status: 'SUGGESTED', decidedAt: null },
      });
      if (!linkedTo) return;
      await tx.matchKey.deleteMany({ where: { listingId: listing.id } });
      await tx.listing.update({
        where: { id: listing.id },
        data: {
          variantId: null,
          matchStatus: 'PENDING',
          matchMethod: null,
          matchScore: null,
          matchedAt: null,
        },
      });
      if (accepted) {
        // Штрихкоди картки, які прийшли у фасування разом з рішенням, — якщо їх не має інша картка
        const others = await tx.listing.findMany({
          where: { variantId: linkedTo },
          select: { barcodes: true },
        });
        const kept = new Set(others.flatMap((o) => o.barcodes));
        await tx.barcode.deleteMany({
          where: {
            variantId: linkedTo,
            source: listing.chain.slug,
            gtin: { in: listing.barcodes.filter((g) => !kept.has(g)) },
          },
        });
      } else {
        // Після відхилення картка стала окремим товаром — він порожній, прибираємо
        await removeIfEmpty(tx, linkedTo);
      }
    });
    await this.matching.request();
  }

  /** Скасувати рішення щодо штрихкоду OFF: GTIN знімається, кандидати знову в черзі */
  async undoBarcode(candidateId: string): Promise<void> {
    const candidate = await this.prisma.barcodeCandidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) throw new NotFoundException('Рішення не знайдено');
    if (candidate.status === 'SUGGESTED' || !candidate.decidedAt)
      throw new ConflictException('Рішення вже скасовано — оновіть сторінку');
    // Рішення — усі кандидати фасування, вирішені тим самим натисканням
    const group = await this.prisma.barcodeCandidate.findMany({
      where: {
        variantId: candidate.variantId,
        decidedAt: candidate.decidedAt,
        status: { in: [...DECIDED] },
      },
      select: { id: true, status: true, gtin: true },
    });
    await this.prisma.$transaction([
      this.prisma.barcodeCandidate.updateMany({
        where: { id: { in: group.map((c) => c.id) } },
        data: { status: 'SUGGESTED', decidedAt: null },
      }),
      this.prisma.barcode.deleteMany({
        where: {
          variantId: candidate.variantId,
          source: REVIEWED_SOURCE,
          gtin: {
            in: group.filter((c) => c.status === 'ACCEPTED').map((c) => c.gtin),
          },
        },
      }),
    ]);
  }
}

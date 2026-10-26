import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { clampPageSize, pageOf } from '../../../common/query';
import { PrismaService } from '../../../prisma/prisma.service';
import type { BarcodeReviewPageDto } from '../dto/catalog.dto';
import { MatchingClient } from './matching.client';

/** Підтверджений модератором GTIN з Open Food Facts */
export const REVIEWED_SOURCE = 'openfoodfacts-review';

/**
 * PRD-27: сумнівні збіги фасувань без штрихкоду мереж з товарами OFF (пише `off:match --write`).
 * Модератор бачить картки фасування й кандидатів OFF і вибирає GTIN або відхиляє всіх.
 */
@Injectable()
export class BarcodeReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingClient,
  ) {}

  async queue(
    pageParam?: number,
    sizeParam?: number,
  ): Promise<BarcodeReviewPageDto> {
    const page = pageOf(pageParam);
    const pageSize = clampPageSize(sizeParam, 20);
    const where = {
      barcodeCandidates: { some: { status: 'SUGGESTED' as const } },
    };
    const [variants, total] = await Promise.all([
      this.prisma.productVariant.findMany({
        where,
        select: {
          id: true,
          label: true,
          productId: true,
          product: {
            select: {
              name: true,
              imageUrl: true,
              brand: { select: { name: true } },
            },
          },
          barcodes: { select: { gtin: true } },
          listings: {
            where: { delistedAt: null },
            take: 5,
            select: { rawName: true, chain: { select: { name: true } } },
          },
          barcodeCandidates: {
            where: { status: 'SUGGESTED' },
            orderBy: { score: 'desc' },
            select: {
              id: true,
              gtin: true,
              score: true,
              offName: true,
              imageUrl: true,
            },
          },
        },
        orderBy: { product: { name: 'asc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.productVariant.count({ where }),
    ]);
    return {
      items: variants.map((v) => ({
        variantId: v.id,
        variantLabel: v.label,
        productId: v.productId,
        productName: v.product.name,
        brand: v.product.brand?.name ?? null,
        imageUrl: v.product.imageUrl,
        barcodes: v.barcodes.map((b) => b.gtin),
        listings: v.listings.map((l) => ({
          chainName: l.chain.name,
          name: l.rawName,
        })),
        candidates: v.barcodeCandidates,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** GTIN кандидата стає штрихкодом фасування; інші кандидати фасування чекають свого рішення */
  async accept(candidateId: string): Promise<void> {
    const candidate = await this.prisma.barcodeCandidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) throw new NotFoundException('Кандидата не знайдено');
    if (candidate.status !== 'SUGGESTED')
      throw new ConflictException(
        'Кандидат уже неактуальний — оновіть сторінку',
      );
    const owner = await this.prisma.barcode.findUnique({
      where: { gtin: candidate.gtin },
      select: {
        variantId: true,
        variant: { select: { product: { select: { name: true } } } },
      },
    });
    if (owner && owner.variantId !== candidate.variantId)
      throw new ConflictException(
        `Штрихкод ${candidate.gtin} уже належить товару «${owner.variant.product.name}» — можливо, це дублікат у каталозі`,
      );
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.barcodeCandidate.update({
        where: { id: candidate.id },
        data: { status: 'ACCEPTED', decidedAt: now },
      }),
      // Решта кандидатів лишається в черзі: у фасування буває кілька штрихкодів (Nord / SÜD,
      // стара й нова упаковка) — модератор вирішує кожен окремо або «жоден не підходить»
      this.prisma.barcode.createMany({
        data: [
          {
            gtin: candidate.gtin,
            variantId: candidate.variantId,
            source: REVIEWED_SOURCE,
          },
        ],
        skipDuplicates: true,
      }),
    ]);
    // Картки інших мереж з цим штрихкодом зіставляться з фасуванням у наступному пакеті
    await this.matching.request();
  }

  async reject(variantId: string): Promise<void> {
    const { count } = await this.prisma.barcodeCandidate.updateMany({
      where: { variantId, status: 'SUGGESTED' },
      data: { status: 'REJECTED', decidedAt: new Date() },
    });
    if (count === 0)
      throw new NotFoundException('Немає кандидатів для цього фасування');
  }
}

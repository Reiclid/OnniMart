import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  BarcodeReviewService,
  REVIEWED_SOURCE,
} from './barcode-review.service';
import { MatchingClient } from './matching.client';

function service(candidate: object | null, owner: object | null = null) {
  const prisma = {
    barcodeCandidate: {
      findUnique: jest.fn(() => Promise.resolve(candidate)),
      update: jest.fn(),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    barcode: {
      findUnique: jest.fn(() => Promise.resolve(owner)),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(() => Promise.resolve([])),
  };
  const matching = { request: jest.fn() };
  return {
    prisma,
    matching,
    review: new BarcodeReviewService(
      prisma as unknown as PrismaService,
      matching as unknown as MatchingClient,
    ),
  };
}

const candidate = (overrides: object = {}) => ({
  id: 'c1',
  variantId: 'v1',
  gtin: '04061458014045',
  score: 0.85,
  status: 'SUGGESTED',
  ...overrides,
});

describe('BarcodeReviewService.accept', () => {
  it('GTIN стає штрихкодом фасування, решта кандидатів лишається в черзі, пакет зіставлення', async () => {
    const { review, prisma, matching } = service(candidate());
    await review.accept('c1');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.barcode.createMany.mock.calls[0][0].data).toEqual([
      { gtin: '04061458014045', variantId: 'v1', source: REVIEWED_SOURCE },
    ]);
    expect(prisma.barcodeCandidate.updateMany).not.toHaveBeenCalled();
    expect(matching.request).toHaveBeenCalled();
  });

  it('штрихкод уже має інше фасування — конфлікт', async () => {
    const { review, prisma } = service(candidate(), {
      variantId: 'v2',
      variant: { product: { name: 'Bacon' } },
    });
    await expect(review.accept('c1')).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('уже вирішений або відсутній кандидат', async () => {
    await expect(
      service(candidate({ status: 'REJECTED' })).review.accept('c1'),
    ).rejects.toThrow(ConflictException);
    await expect(service(null).review.accept('c1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('BarcodeReviewService.reject', () => {
  it('немає кандидатів — 404', async () => {
    await expect(service(null).review.reject('v1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

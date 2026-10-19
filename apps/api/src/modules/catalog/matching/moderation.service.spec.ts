import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { claim, StaleListing } from './matching.service';
import { MatchingClient } from './matching.client';
import { ModerationService } from './moderation.service';

type Args = any;

function service(candidate: object | null, foreign: unknown[] = []) {
  const prisma = {
    matchCandidate: {
      findUnique: jest.fn(() => Promise.resolve(candidate)),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    listing: { update: jest.fn() },
    barcode: {
      createMany: jest.fn(),
      findMany: jest.fn((): Promise<unknown[]> => Promise.resolve(foreign)),
    },
    $transaction: jest.fn(() => Promise.resolve([])),
  };
  const matching = { request: jest.fn() };
  return {
    prisma,
    moderation: new ModerationService(
      prisma as unknown as PrismaService,
      matching as unknown as MatchingClient,
    ),
  };
}

const candidate = (overrides: object = {}) => ({
  id: 'c1',
  listingId: 'l1',
  variantId: 'v1',
  score: 0.8,
  status: 'SUGGESTED',
  listing: { variantId: null, barcodes: [], chain: { slug: 'novus' } },
  ...overrides,
});

describe('ModerationService.acceptCandidate', () => {
  it('підтверджує актуального кандидата', async () => {
    const { moderation, prisma } = service(candidate());
    await moderation.acceptCandidate('c1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it.each([
    ['уже відхилений', candidate({ status: 'REJECTED' })],
    [
      'картку вже зіставлено',
      candidate({
        listing: { variantId: 'v2', barcodes: [], chain: { slug: 'novus' } },
      }),
    ],
  ])('%s → 409', async (_case, stale) => {
    const { moderation, prisma } = service(stale);
    await expect(moderation.acceptCandidate('c1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ModerationService: конфлікт штрихкодів', () => {
  it('штрихкод картки належить іншому товару → 409', async () => {
    const { moderation, prisma } = service(
      candidate({
        listing: {
          variantId: null,
          barcodes: ['05449000132499'],
          chain: { slug: 'novus' },
        },
      }),
      [{ gtin: '05449000132499', variant: { product: { name: 'Fanta' } } }],
    );
    await expect(moderation.acceptCandidate('c1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('claim', () => {
  const tx = (count: number) =>
    ({
      listing: {
        updateMany: jest.fn((_args: Args) => Promise.resolve({ count })),
      },
    }) as any;
  const data = { variantId: 'v1', matchStatus: 'AUTO_MATCHED' as const };

  it('пише лише в незіставлену картку', async () => {
    const client = tx(1);
    await claim(client, 'l1', data);
    expect(client.listing.updateMany.mock.calls[0][0].where).toEqual({
      id: 'l1',
      variantId: null,
    });
  });

  it('картку вже зіставили — StaleListing (відкат транзакції)', async () => {
    await expect(claim(tx(0), 'l1', data)).rejects.toBeInstanceOf(StaleListing);
  });
});

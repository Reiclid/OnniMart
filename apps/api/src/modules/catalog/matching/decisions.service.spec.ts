import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionsService } from './decisions.service';
import { MatchingClient } from './matching.client';

const AT = new Date('2026-10-26T20:00:00Z');

function setup(options: {
  candidate: object | null;
  group: { id: string; status: string; variantId: string }[];
  others?: { barcodes: string[] }[];
}) {
  const tx = {
    matchCandidate: {
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    matchKey: { deleteMany: jest.fn() },
    listing: {
      update: jest.fn(),
      findMany: jest.fn(() => Promise.resolve(options.others ?? [])),
      count: jest.fn(() => Promise.resolve(0)),
    },
    barcode: { deleteMany: jest.fn() },
    subscription: { count: jest.fn(() => Promise.resolve(0)) },
    productVariant: {
      delete: jest.fn(() => Promise.resolve({ productId: 'p-created' })),
      count: jest.fn(() => Promise.resolve(0)),
    },
    product: { delete: jest.fn() },
  };
  const prisma = {
    matchCandidate: {
      findUnique: jest.fn(() => Promise.resolve(options.candidate)),
      findMany: jest.fn(() => Promise.resolve(options.group)),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const matching = { request: jest.fn() };
  return {
    tx,
    matching,
    decisions: new DecisionsService(
      prisma as unknown as PrismaService,
      matching as unknown as MatchingClient,
    ),
  };
}

const listing = (over: object = {}) => ({
  id: 'l1',
  variantId: 'v1',
  matchMethod: 'MANUAL',
  barcodes: ['04000000000001', '04000000000002'],
  chain: { slug: 'aldi-sued' },
  ...over,
});

describe('DecisionsService.undoMatch', () => {
  it('скасувати «той самий товар»: кандидати знову в черзі, картка відвʼязана, штрихкоди картки знято', async () => {
    const { decisions, tx, matching } = setup({
      candidate: {
        id: 'c1',
        status: 'ACCEPTED',
        decidedAt: AT,
        variantId: 'v1',
        details: null,
        listing: listing(),
      },
      group: [
        { id: 'c1', status: 'ACCEPTED', variantId: 'v1' },
        { id: 'c2', status: 'REJECTED', variantId: 'v2' },
      ],
      // Інша картка фасування має той самий штрихкод — його лишаємо
      others: [{ barcodes: ['04000000000002'] }],
    });
    await decisions.undoMatch('c1');

    expect(tx.matchCandidate.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ['c1', 'c2'] } },
      data: { status: 'SUGGESTED', decidedAt: null },
    });
    expect(tx.listing.update.mock.calls[0][0].data).toMatchObject({
      variantId: null,
      matchStatus: 'PENDING',
    });
    expect(tx.barcode.deleteMany.mock.calls[0][0].where.gtin.in).toEqual([
      '04000000000001',
    ]);
    // Фасування, з яким помилково обʼєднали, не видаляється
    expect(tx.productVariant.delete).not.toHaveBeenCalled();
    expect(matching.request).toHaveBeenCalled();
  });

  it('скасувати «жоден не підходить»: товар, створений для картки, прибирається', async () => {
    const { decisions, tx } = setup({
      candidate: {
        id: 'c1',
        status: 'REJECTED',
        decidedAt: AT,
        variantId: 'v1',
        details: null,
        listing: listing({ variantId: 'v-created', matchMethod: 'CREATED' }),
      },
      group: [{ id: 'c1', status: 'REJECTED', variantId: 'v1' }],
    });
    await decisions.undoMatch('c1');

    expect(tx.listing.update).toHaveBeenCalled();
    expect(tx.productVariant.delete).toHaveBeenCalledWith({
      where: { id: 'v-created' },
    });
    expect(tx.product.delete).toHaveBeenCalledWith({
      where: { id: 'p-created' },
    });
  });

  it('конфлікти: картку перезіставлено, підтверджено з іншим товаром, відвʼязування', async () => {
    const accepted = (over: object) =>
      setup({
        candidate: {
          id: 'c1',
          status: 'ACCEPTED',
          decidedAt: AT,
          variantId: 'v1',
          details: null,
          listing: listing(over),
        },
        group: [{ id: 'c1', status: 'ACCEPTED', variantId: 'v1' }],
      }).decisions.undoMatch('c1');
    await expect(accepted({ variantId: 'v9' })).rejects.toThrow(
      ConflictException,
    );

    const rejectedThenManual = setup({
      candidate: {
        id: 'c1',
        status: 'REJECTED',
        decidedAt: AT,
        variantId: 'v1',
        details: null,
        listing: listing({ variantId: 'v9', matchMethod: 'MANUAL' }),
      },
      group: [{ id: 'c1', status: 'REJECTED', variantId: 'v1' }],
    });
    await expect(rejectedThenManual.decisions.undoMatch('c1')).rejects.toThrow(
      ConflictException,
    );

    const unlinked = setup({
      candidate: {
        id: 'c1',
        status: 'REJECTED',
        decidedAt: AT,
        variantId: 'v1',
        details: { reason: 'unlinked' },
        listing: listing(),
      },
      group: [],
    });
    await expect(unlinked.decisions.undoMatch('c1')).rejects.toThrow(
      ConflictException,
    );
  });
});

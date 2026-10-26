import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingClient } from './matching/matching.client';
import { ADMIN_SOURCE, ProductEditService } from './product-edit.service';

function service(owner: object | null = null) {
  const delegates = {
    product: {
      findUnique: jest.fn(() => Promise.resolve({ id: 'p1' })),
      update: jest.fn(),
    },
    productVariant: {
      findUnique: jest.fn(() => Promise.resolve({ id: 'v1' })),
      update: jest.fn(),
    },
    brand: { upsert: jest.fn(() => Promise.resolve({ id: 'b1' })) },
    category: { upsert: jest.fn(() => Promise.resolve({ id: 'c1' })) },
    matchKey: { deleteMany: jest.fn() },
    barcode: {
      findUnique: jest.fn(() => Promise.resolve(owner)),
      create: jest.fn(),
    },
  };
  const prisma = {
    ...delegates,
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof delegates) => unknown)(delegates)
        : Promise.resolve(arg),
    ),
  };
  const matching = { request: jest.fn() };
  return {
    prisma,
    matching,
    edits: new ProductEditService(
      prisma as unknown as PrismaService,
      matching as unknown as MatchingClient,
    ),
  };
}

describe('ProductEditService', () => {
  it('категорія від модератора фіксується, null — знову автоматична', async () => {
    const { edits, prisma } = service();
    await edits.updateProduct('p1', { category: 'drinks' });
    expect(prisma.product.update.mock.calls[0][0].data).toMatchObject({
      categoryId: 'c1',
      categoryLocked: true,
    });
    await edits.updateProduct('p1', { category: null });
    expect(prisma.product.update.mock.calls[1][0].data).toMatchObject({
      categoryId: null,
      categoryLocked: false,
    });
  });

  it('нова назва чи бренд скидають ключі товару і запускають пакет', async () => {
    const { edits, prisma, matching } = service();
    await edits.updateProduct('p1', { brand: 'Coca-Cola', name: 'Напій' });
    expect(prisma.product.update.mock.calls[0][0].data.brandId).toBe('b1');
    expect(prisma.matchKey.deleteMany).toHaveBeenCalledWith({
      where: { listingId: null, variant: { productId: 'p1' } },
    });
    expect(matching.request).toHaveBeenCalled();
  });

  it('нове фасування — автоматичний підпис і всі ключі фасування заново', async () => {
    const { edits, prisma } = service();
    await edits.updateVariant('v1', { quantity: '0,5 л' });
    expect(prisma.productVariant.update.mock.calls[0][0].data).toMatchObject({
      measure: 'VOLUME',
      netQuantity: 500,
      label: '0,5 л',
    });
    expect(prisma.matchKey.deleteMany).toHaveBeenCalledWith({
      where: { variantId: 'v1' },
    });
  });

  it('штрихкод чужого товару — 409, новий — з джерелом admin', async () => {
    const taken = service({
      variantId: 'v2',
      variant: { label: '1 л', product: { name: 'Fanta' } },
    });
    await expect(taken.edits.addBarcode('v1', '5449000000996')).rejects.toThrow(
      ConflictException,
    );
    const { edits, prisma } = service();
    await edits.addBarcode('v1', '5449000000996');
    expect(prisma.barcode.create).toHaveBeenCalledWith({
      data: { gtin: '05449000000996', variantId: 'v1', source: ADMIN_SOURCE },
    });
  });
});

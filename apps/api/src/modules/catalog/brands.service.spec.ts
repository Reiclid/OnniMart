import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BrandsService } from './brands.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MatchingClient } from './matching/matching.client';

const BRANDS = {
  dup: { id: 'dup', name: 'MEINE KUCHEN WELT', slug: 'meine-kuchen-welt' },
  main: { id: 'main', name: 'MEINE KUCHENWELT', slug: 'meine-kuchenwelt' },
};

function service() {
  const delegates = {
    brand: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(BRANDS[where.id as keyof typeof BRANDS] ?? null),
      ),
      update: jest.fn(),
      delete: jest.fn(),
    },
    productLine: {
      findMany: jest.fn(() =>
        Promise.resolve([
          // У основного бренду вже є «Backkuchen» — ця лінійка зливається з ним
          {
            id: 'l1',
            slug: 'meine-kuchen-welt-backkuchen',
            name: 'MEINE KUCHEN WELT · Backkuchen',
          },
          {
            id: 'l2',
            slug: 'meine-kuchen-welt-muffins',
            name: 'MEINE KUCHEN WELT · Muffins',
          },
        ]),
      ),
      findUnique: jest.fn(({ where }: { where: { slug: string } }) =>
        Promise.resolve(
          where.slug === 'meine-kuchenwelt-backkuchen' ? { id: 'l0' } : null,
        ),
      ),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: { updateMany: jest.fn() },
    matchKey: { deleteMany: jest.fn() },
    brandAlias: {
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const prisma = {
    ...delegates,
    $transaction: jest.fn((fn: (tx: typeof delegates) => unknown) =>
      fn(delegates),
    ),
  };
  const matching = { request: jest.fn() };
  return {
    prisma,
    matching,
    brands: new BrandsService(
      prisma as unknown as PrismaService,
      matching as unknown as MatchingClient,
    ),
  };
}

describe('BrandsService.merge', () => {
  it('лінійки й товари переходять до основного, дублікат стає аліасом', async () => {
    const { brands, prisma, matching } = service();
    await brands.merge('dup', 'main');

    // Лінійка з тими самими словами зливається з наявною
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { lineId: 'l1' },
      data: { lineId: 'l0' },
    });
    expect(prisma.productLine.delete).toHaveBeenCalledWith({
      where: { id: 'l1' },
    });
    // Решта — переключається на ключ і назву основного бренду
    expect(prisma.productLine.update).toHaveBeenCalledWith({
      where: { id: 'l2' },
      data: {
        slug: 'meine-kuchenwelt-muffins',
        name: 'MEINE KUCHENWELT · Muffins',
        brandId: 'main',
      },
    });
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { brandId: 'dup' },
      data: { brandId: 'main' },
    });
    expect(prisma.matchKey.deleteMany).toHaveBeenCalledWith({
      where: { variant: { product: { brandId: 'dup' } } },
    });
    // Аліаси дубліката переходять до основного, ключ дубліката — новий аліас
    expect(prisma.brandAlias.updateMany).toHaveBeenCalledWith({
      where: { brandId: 'dup' },
      data: { brandId: 'main' },
    });
    expect(prisma.brandAlias.deleteMany).toHaveBeenCalledWith({
      where: { alias: 'meine-kuchenwelt' },
    });
    expect(prisma.brandAlias.create).toHaveBeenCalledWith({
      data: { alias: 'meine-kuchen-welt', brandId: 'main' },
    });
    expect(prisma.brand.delete).toHaveBeenCalledWith({ where: { id: 'dup' } });
    expect(matching.request).toHaveBeenCalled();
  });

  it('сам із собою, без id чи з невідомим брендом — помилка', async () => {
    const { brands, prisma } = service();
    await expect(brands.merge('dup', 'dup')).rejects.toThrow(
      BadRequestException,
    );
    await expect(brands.merge('dup', undefined)).rejects.toThrow(
      BadRequestException,
    );
    await expect(brands.merge('dup', 'nope')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('BrandsService.rename', () => {
  it('нова назва в бренді й лінійках, ключі назв товарів — заново', async () => {
    const { brands, prisma, matching } = service();
    prisma.productLine.findMany.mockResolvedValueOnce([
      { id: 'l1', slug: 'x', name: 'MEINE KUCHENWELT · Cupcakes' },
    ]);
    await brands.rename('main', '  Meine Kuchenwelt ');
    expect(prisma.brand.update).toHaveBeenCalledWith({
      where: { id: 'main' },
      data: { name: 'Meine Kuchenwelt' },
    });
    expect(prisma.productLine.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { name: 'Meine Kuchenwelt · Cupcakes' },
    });
    expect(prisma.matchKey.deleteMany).toHaveBeenCalledWith({
      where: { listingId: null, variant: { product: { brandId: 'main' } } },
    });
    expect(matching.request).toHaveBeenCalled();
  });

  it('та сама назва — нічого не робить', async () => {
    const { brands, prisma } = service();
    await brands.rename('main', 'MEINE KUCHENWELT');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

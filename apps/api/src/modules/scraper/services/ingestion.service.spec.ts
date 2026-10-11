import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ScrapedProductDto } from '../dto/scraped-product.dto';
import { IngestionService } from './ingestion.service';

const ATB = { id: 'chain-atb', slug: 'atb', name: 'АТБ' };

// Аргументи Prisma-викликів у тестах перевіряємо через toMatchObject
type Args = any;

function createPrismaMock() {
  const delegates = {
    storeChain: {
      findUnique: jest.fn((args: Args) =>
        Promise.resolve(args.where.slug === 'atb' ? ATB : null),
      ),
    },
    listing: {
      findUnique: jest.fn((_args: Args): Promise<unknown> =>
        Promise.resolve(null),
      ),
      upsert: jest.fn((_args: Args) =>
        Promise.resolve({ id: 'listing-1', variantId: null as string | null }),
      ),
      update: jest.fn((_args: Args) => Promise.resolve({})),
    },
    priceSnapshot: { create: jest.fn((_args: Args) => Promise.resolve({})) },
    barcode: {
      findFirst: jest.fn((_args: Args): Promise<unknown> =>
        Promise.resolve(null),
      ),
    },
  };
  return {
    ...delegates,
    $transaction: jest.fn((fn: (tx: typeof delegates) => Promise<unknown>) =>
      fn(delegates),
    ),
  };
}

function product(
  overrides: Partial<ScrapedProductDto> = {},
): ScrapedProductDto {
  return {
    store: 'atb',
    external: '12345',
    name: 'Напій Coca-Cola Zero 0,5л',
    price: 25,
    scraper_at: '2026-10-11T10:00:00Z',
    ...overrides,
  };
}

describe('IngestionService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: IngestionService;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new IngestionService(prisma as unknown as PrismaService);
  });

  it('пропускає товар невідомої мережі', async () => {
    await expect(service.ingest(product({ store: 'unknown' }))).resolves.toBe(
      'skipped',
    );
    expect(prisma.listing.upsert).not.toHaveBeenCalled();
  });

  it('пропускає некоректне повідомлення', async () => {
    await expect(service.ingest(product({ price: 0 }))).resolves.toBe(
      'skipped',
    );
    await expect(service.ingest(product({ name: ' ' }))).resolves.toBe(
      'skipped',
    );
    expect(prisma.storeChain.findUnique).not.toHaveBeenCalled();
  });

  it('створює картку та перший запис історії цін з ціною за 1 л', async () => {
    await expect(service.ingest(product())).resolves.toBe('changed');

    const upsert = prisma.listing.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({
      chainId_externalId: { chainId: ATB.id, externalId: '12345' },
    });
    expect(upsert.create).toMatchObject({
      chainId: ATB.id,
      externalId: '12345',
      measure: 'VOLUME',
      netQuantity: 500,
      currentPrice: 25,
      unitPrice: 50,
      isOnPromo: false,
    });

    const snapshot = prisma.priceSnapshot.create.mock.calls[0][0];
    expect(snapshot.data).toMatchObject({
      listingId: 'listing-1',
      price: 25,
      regularPrice: null,
      unitPrice: 50,
      promoType: null,
      capturedAt: new Date('2026-10-11T10:00:00Z'),
    });
  });

  it('не дублює історію, якщо ціна не змінилась', async () => {
    prisma.listing.findUnique.mockResolvedValue({
      currentPrice: '25.00',
      regularPrice: null,
      inStock: true,
    });

    await expect(service.ingest(product())).resolves.toBe('unchanged');
    expect(prisma.listing.upsert).toHaveBeenCalled();
    expect(prisma.priceSnapshot.create).not.toHaveBeenCalled();
  });

  it('записує знижку, коли стара ціна більша за поточну', async () => {
    prisma.listing.findUnique.mockResolvedValue({
      currentPrice: '25.00',
      regularPrice: null,
      inStock: true,
    });

    await expect(
      service.ingest(product({ price: 19.9, old_price: 25 })),
    ).resolves.toBe('changed');

    const snapshot = prisma.priceSnapshot.create.mock.calls[0][0];
    expect(snapshot.data).toMatchObject({
      price: 19.9,
      regularPrice: 25,
      promoType: 'DISCOUNT',
    });
    const upsert = prisma.listing.upsert.mock.calls[0][0];
    expect(upsert.update.isOnPromo).toBe(true);
  });

  it('вважає товар ваговим, якщо ціна вказана за кг', async () => {
    await service.ingest(
      product({ name: 'Банани', price: 64.9, price_unit: 'кг' }),
    );

    const upsert = prisma.listing.upsert.mock.calls[0][0];
    expect(upsert.create).toMatchObject({
      measure: 'MASS',
      netQuantity: 1000,
      isWeighted: true,
      unitPrice: 64.9,
    });
  });

  it('зіставляє товар з каталогом за штрихкодом', async () => {
    prisma.barcode.findFirst.mockResolvedValue({
      gtin: '05449000132499',
      variantId: 'variant-fanta',
    });

    await service.ingest(
      product({ barcodes: ['5449000132499', '0250013065514', '11824797'] }),
    );

    const upsert = prisma.listing.upsert.mock.calls[0][0];
    // Внутрішні коди мережі та невалідні коди відкидаються
    expect(upsert.create.barcodes).toEqual(['05449000132499']);
    expect(prisma.barcode.findFirst).toHaveBeenCalledWith({
      where: { gtin: { in: ['05449000132499'] } },
    });
    expect(prisma.listing.update).toHaveBeenCalledWith({
      where: { id: 'listing-1' },
      data: expect.objectContaining({
        variantId: 'variant-fanta',
        matchStatus: 'AUTO_MATCHED',
        matchMethod: 'BARCODE',
        matchScore: 1,
      }),
    });
  });

  it('не шукає штрихкод, якщо картка вже зіставлена', async () => {
    prisma.listing.upsert.mockResolvedValue({
      id: 'listing-1',
      variantId: 'variant-1',
    });

    await service.ingest(product({ barcodes: ['5449000132499'] }));
    expect(prisma.barcode.findFirst).not.toHaveBeenCalled();
  });
});

import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildWhere, MonitoringService } from './monitoring.service';

type Args = any;

const LISTING = {
  id: 'listing-1',
  externalId: '932943',
  rawName: 'Напій Dr.Pepper газований з/б',
  rawBrand: 'Dr.Pepper',
  rawCategory: 'napoi-52',
  url: 'https://silpo.ua/product/x',
  imageUrl: null,
  measure: 'VOLUME',
  // Prisma повертає Decimal; у тесті імітуємо рядком
  netQuantity: '355',
  packCount: 1,
  isWeighted: false,
  currentPrice: '59.99',
  regularPrice: '82.99',
  unitPrice: '168.99',
  isOnPromo: true,
  inStock: true,
  delistedAt: null,
  matchStatus: 'PENDING',
  barcodes: ['05000112552218'],
  firstSeenAt: new Date('2026-10-10T08:00:00Z'),
  lastSeenAt: new Date('2026-10-11T08:00:00Z'),
  rawData: { store: 'silpo' },
  chain: { slug: 'silpo', name: 'Сільпо', currency: 'UAH' },
};

describe('MonitoringService', () => {
  let prisma: {
    listing: { findMany: jest.Mock; count: jest.Mock; findUnique: jest.Mock };
  };
  let service: MonitoringService;

  beforeEach(() => {
    prisma = {
      listing: {
        findMany: jest.fn((_args: Args) => Promise.resolve([LISTING])),
        count: jest.fn((_args: Args) => Promise.resolve(120)),
        findUnique: jest.fn((_args: Args): Promise<unknown> =>
          Promise.resolve(null),
        ),
      },
    };
    service = new MonitoringService(prisma as unknown as PrismaService);
  });

  it('перетворює Decimal у числа та підписує фасування', async () => {
    const page = await service.getListings({});
    expect(page).toMatchObject({ total: 120, page: 1, pageSize: 50 });
    expect(page.items[0]).toMatchObject({
      chainSlug: 'silpo',
      currency: 'UAH',
      name: 'Напій Dr.Pepper газований з/б',
      currentPrice: 59.99,
      regularPrice: 82.99,
      unitPrice: 168.99,
      unitLabel: 'л',
      quantityLabel: '0,355 л',
      lastSeenAt: '2026-10-11T08:00:00.000Z',
    });
  });

  it('обмежує розмір сторінки та рахує зсув', async () => {
    await service.getListings({
      page: '3' as never,
      pageSize: '1000' as never,
    });
    expect(prisma.listing.findMany.mock.calls[0][0]).toMatchObject({
      skip: 400,
      take: 200,
    });
  });

  it('повертає 404 для неіснуючої картки', async () => {
    await expect(service.getListing('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('віддає історію цін картки', async () => {
    prisma.listing.findUnique.mockResolvedValue({
      ...LISTING,
      variant: null,
      priceSnapshots: [
        {
          id: BigInt(7),
          price: '59.99',
          regularPrice: '82.99',
          unitPrice: null,
          promoType: 'DISCOUNT',
          promoLabel: null,
          promoEndsAt: new Date('2026-10-14T00:00:00Z'),
          inStock: true,
          capturedAt: new Date('2026-10-11T08:00:00Z'),
        },
      ],
    });

    const details = await service.getListing('listing-1');
    expect(details.history).toEqual([
      {
        id: '7',
        price: 59.99,
        regularPrice: 82.99,
        unitPrice: null,
        promoType: 'DISCOUNT',
        promoLabel: null,
        promoEndsAt: '2026-10-14T00:00:00.000Z',
        inStock: true,
        capturedAt: '2026-10-11T08:00:00.000Z',
      },
    ]);
    expect(details.firstSeenAt).toBe('2026-10-10T08:00:00.000Z');
    expect(details.rawData).toEqual({ store: 'silpo' });
  });

  it('знаходить той самий товар в інших мережах за штрихкодом', async () => {
    prisma.listing.findUnique.mockResolvedValue({
      ...LISTING,
      variant: null,
      priceSnapshots: [],
    });
    prisma.listing.findMany.mockResolvedValue([
      {
        ...LISTING,
        id: 'listing-2',
        chain: { slug: 'novus', name: 'NOVUS', currency: 'UAH' },
      },
    ]);

    const details = await service.getListing('listing-1');
    expect(prisma.listing.findMany.mock.calls[0][0].where).toEqual({
      id: { not: 'listing-1' },
      OR: [{ barcodes: { hasSome: ['05000112552218'] } }],
    });
    expect(details.otherOffers).toHaveLength(1);
    expect(details.otherOffers[0]).toMatchObject({
      id: 'listing-2',
      chainName: 'NOVUS',
    });
  });

  it('бере пропозиції того самого фасування каталогу', async () => {
    prisma.listing.findUnique.mockResolvedValue({
      ...LISTING,
      barcodes: [],
      variantId: 'variant-1',
      variant: {
        id: 'variant-1',
        productId: 'p1',
        label: '1,25 л',
        product: { name: 'Coca-Cola' },
      },
      priceSnapshots: [],
    });
    prisma.listing.findMany.mockResolvedValue([]);

    await service.getListing('listing-1');
    expect(prisma.listing.findMany.mock.calls[0][0].where).toEqual({
      id: { not: 'listing-1' },
      OR: [{ variantId: 'variant-1' }],
    });
  });

  it('не шукає збігів без штрихкоду й зіставлення', async () => {
    prisma.listing.findUnique.mockResolvedValue({
      ...LISTING,
      barcodes: [],
      variant: null,
      priceSnapshots: [],
    });

    const details = await service.getListing('listing-1');
    expect(prisma.listing.findMany).not.toHaveBeenCalled();
    expect(details.otherOffers).toEqual([]);
  });
});

describe('buildWhere', () => {
  it('фільтрує за мережею, акцією та зіставленням', () => {
    expect(
      buildWhere({ chain: 'novus', promo: 'true' as never, matched: true }),
    ).toEqual({
      chain: { slug: 'novus' },
      isOnPromo: true,
      delistedAt: null,
      variantId: { not: null },
    });
  });

  it('шукає штрихкод у нормалізованому вигляді', () => {
    const where = buildWhere({ q: '5449000132499' });
    expect(where.OR).toContainEqual({ barcodes: { has: '05449000132499' } });
  });

  it('шукає текст без урахування регістру', () => {
    const where = buildWhere({ q: ' cola ' });
    expect(where.OR).toEqual([
      { rawName: { contains: 'cola', mode: 'insensitive' } },
      { rawBrand: { contains: 'cola', mode: 'insensitive' } },
    ]);
  });
});

describe('MonitoringService: кеш важких підрахунків', () => {
  const chain = {
    id: 'c1',
    slug: 'silpo',
    name: 'Сільпо',
    website: 'https://silpo.ua',
    countryCode: 'UA',
    currency: 'UAH',
    scrapeEnabled: true,
    status: 'ACTIVE',
    onlinePrices: true,
    notes: null,
  };

  function setup() {
    const prisma = {
      listing: { count: jest.fn(() => Promise.resolve(7)) },
      priceSnapshot: { count: jest.fn(() => Promise.resolve(70)) },
      storeChain: {
        count: jest.fn(() => Promise.resolve(3)),
        findMany: jest.fn(() => Promise.resolve([chain])),
      },
      scrapeRun: {
        findFirst: jest.fn(() => Promise.resolve(null)),
        findMany: jest.fn(() => Promise.resolve([])),
      },
      $queryRaw: jest.fn(() =>
        Promise.resolve([{ chainId: 'c1', listings: 500, promo: 12 }]),
      ),
    };
    const heavy = () =>
      prisma.listing.count.mock.calls.length +
      prisma.priceSnapshot.count.mock.calls.length +
      prisma.$queryRaw.mock.calls.length;
    return {
      prisma,
      heavy,
      service: new MonitoringService(prisma as unknown as PrismaService),
    };
  }

  it('повторне оновлення Огляду не чіпає listings і price_snapshots', async () => {
    const { service, heavy } = setup();

    await Promise.all([service.getStats(), service.getChains()]);
    // 5 лічильників у getStats + один прохід по listings у getChains
    expect(heavy()).toBe(6);

    await Promise.all([service.getStats(), service.getChains()]);
    expect(heavy()).toBe(6);
  });

  it('дешеві дані лишаються живими: мережі й останній запуск читаються щоразу', async () => {
    const { service, prisma } = setup();
    await service.getStats();
    await service.getStats();
    expect(prisma.storeChain.count).toHaveBeenCalledTimes(4);
    expect(prisma.scrapeRun.findFirst).toHaveBeenCalledTimes(2);
  });

  it('віддає кількості мереж із кешу, а мережі без товарів — з нулями', async () => {
    const { service, prisma } = setup();
    prisma.storeChain.findMany.mockResolvedValue([
      chain,
      { ...chain, id: 'c2', slug: 'novus' },
    ] as never);
    const chains = await service.getChains();
    expect(chains.map((c) => [c.listingsCount, c.promoCount])).toEqual([
      [500, 12],
      [0, 0],
    ]);
  });
});

import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MatchingService } from '../../catalog/matching/matching.service';
import { RunEventMessage, ScrapedProductMessage } from '@repo/contracts';
import { IngestionService } from './ingestion.service';

const ATB = { id: 'chain-atb', slug: 'atb', name: 'АТБ' };
const RUN_ID = 'run-1';

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
      findMany: jest.fn((_args: Args): Promise<unknown[]> =>
        Promise.resolve([]),
      ),
      upsert: jest.fn((_args: Args) =>
        Promise.resolve({ id: 'listing-1', variantId: null as string | null }),
      ),
      update: jest.fn((_args: Args) => Promise.resolve({})),
      updateMany: jest.fn((_args: Args) => Promise.resolve({ count: 1 })),
    },
    priceSnapshot: {
      create: jest.fn((_args: Args) => Promise.resolve({})),
      createMany: jest.fn((_args: Args) => Promise.resolve({ count: 1 })),
    },
    matchingRule: {
      findUnique: jest.fn((_args: Args): Promise<unknown> =>
        Promise.resolve(null),
      ),
    },
    matchRuleHit: {
      createMany: jest.fn((_args: Args) => Promise.resolve({ count: 1 })),
    },
    barcode: {
      findMany: jest.fn((_args: Args): Promise<unknown[]> =>
        Promise.resolve([]),
      ),
    },
    scrapeRun: {
      findUnique: jest.fn((args: Args) =>
        Promise.resolve(args.where.id === RUN_ID ? { id: RUN_ID } : null),
      ),
      update: jest.fn((_args: Args) => Promise.resolve({})),
    },
  };
  return {
    ...delegates,
    $transaction: jest.fn(
      (fn: (tx: typeof delegates) => Promise<unknown>, _options?: unknown) =>
        fn(delegates),
    ),
  };
}

/** Картка, що вже є в базі з ціною 25 без акції */
const EXISTING = {
  id: 'listing-1',
  chainId: ATB.id,
  externalId: '12345',
  currentPrice: '25.00',
  regularPrice: null,
  isOnPromo: false,
  inStock: true,
};

function product(
  overrides: Partial<ScrapedProductMessage> = {},
): ScrapedProductMessage {
  return {
    store: 'atb',
    external: '12345',
    name: 'Напій Coca-Cola Zero 0,5л',
    price: 25,
    scraper_at: '2026-10-11T10:00:00Z',
    ...overrides,
  };
}

function event(overrides: Partial<RunEventMessage> = {}): RunEventMessage {
  return {
    kind: 'run_started',
    run_id: RUN_ID,
    store: 'atb',
    pages_fetched: 0,
    items_seen: 0,
    at: '2026-10-11T10:00:00Z',
    ...overrides,
  };
}

describe('IngestionService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: IngestionService;
  let matching: { schedule: jest.Mock };

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    prisma = createPrismaMock();
    matching = { schedule: jest.fn() };
    service = new IngestionService(
      prisma as unknown as PrismaService,
      matching as unknown as MatchingService,
    );
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

    const snapshot = prisma.priceSnapshot.createMany.mock.calls[0][0];
    expect(snapshot.data[0]).toMatchObject({
      listingId: 'listing-1',
      price: 25,
      regularPrice: null,
      unitPrice: 50,
      promoType: null,
      scrapeRunId: null,
      capturedAt: new Date('2026-10-11T10:00:00Z'),
    });
  });

  it('не дублює історію, якщо ціна не змінилась', async () => {
    prisma.listing.findMany.mockResolvedValue([EXISTING]);

    await expect(service.ingest(product())).resolves.toBe('unchanged');
    // Лише UPDATE: lastSeenAt, назва тощо; без upsert і без запису в історію
    expect(prisma.listing.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'listing-1' } }),
    );
    expect(prisma.listing.upsert).not.toHaveBeenCalled();
    expect(prisma.priceSnapshot.createMany).not.toHaveBeenCalled();
  });

  it('ціна з трьома знаками не дає нового запису на кожному обході', async () => {
    // У БД DECIMAL(12,2): 24.999 зберігається як 25.00
    prisma.listing.findMany.mockResolvedValue([EXISTING]);

    await expect(service.ingest(product({ price: 24.999 }))).resolves.toBe(
      'unchanged',
    );
    expect(prisma.priceSnapshot.createMany).not.toHaveBeenCalled();
  });

  it('записує знижку і дату закінчення акції', async () => {
    prisma.listing.findMany.mockResolvedValue([EXISTING]);

    await expect(
      service.ingest(
        product({
          price: 19.9,
          old_price: 25,
          promo_label: '-20%',
          promo_ends_at: '2026-10-14',
        }),
      ),
    ).resolves.toBe('changed');

    const snapshot = prisma.priceSnapshot.createMany.mock.calls[0][0];
    expect(snapshot.data[0]).toMatchObject({
      price: 19.9,
      regularPrice: 25,
      promoType: 'DISCOUNT',
      promoLabel: '-20%',
      promoEndsAt: new Date('2026-10-14'),
    });
    const upsert = prisma.listing.upsert.mock.calls[0][0];
    expect(upsert.update.isOnPromo).toBe(true);
  });

  it('позначає ціну з карткою лояльності як LOYALTY', async () => {
    await service.ingest(
      product({ old_price: 29, promo_label: 'Ціна з карткою лояльності' }),
    );
    const snapshot = prisma.priceSnapshot.createMany.mock.calls[0][0];
    expect(snapshot.data[0].promoType).toBe('LOYALTY');
  });

  it.each(['Kaufland Card -44%', 'PENNY App 0.99'])(
    'вважає "%s" ціною для учасників програми лояльності',
    async (label) => {
      await service.ingest(product({ promo_label: label }));
      const snapshot = prisma.priceSnapshot.createMany.mock.calls[0][0];
      expect(snapshot.data[0].promoType).toBe('LOYALTY');
    },
  );

  it('бере фасування з поля size, якщо його немає в назві', async () => {
    await service.ingest(
      product({
        name: 'Cola Zero / Light',
        size: '1,5-L-Flasche',
        price: 0.49,
      }),
    );
    const upsert = prisma.listing.upsert.mock.calls[0][0];
    expect(upsert.create).toMatchObject({
      measure: 'VOLUME',
      netQuantity: 1500,
      unitPrice: 0.33,
    });
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

  it('прив’язує історію до запуску і рахує змінені товари', async () => {
    await service.ingest(product({ run_id: RUN_ID }));
    await service.ingest(product({ run_id: RUN_ID, external: '777' }));

    const snapshot = prisma.priceSnapshot.createMany.mock.calls[0][0];
    expect(snapshot.data[0].scrapeRunId).toBe(RUN_ID);
    expect(prisma.scrapeRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: { itemsChanged: { increment: 1 } },
    });
    // Існування запуску перевіряється один раз
    expect(prisma.scrapeRun.findUnique).toHaveBeenCalledTimes(1);
  });

  it('прогрес на ходу: записані товари запуску додаються до itemsSeen до підсумку', async () => {
    for (const external of ['1', '2', '3'])
      await service.ingest(product({ run_id: RUN_ID, external }));
    await service.handleRunEvent(
      event({ kind: 'run_finished', items_seen: 3 }),
    );

    const updates = prisma.scrapeRun.update.mock.calls.map((c) => c[0].data);
    const increments = updates
      .map((d: Args) => d.itemsSeen?.increment as number | undefined)
      .filter((n): n is number => n !== undefined);
    // Перший товар пишеться одразу, решта — разом перед run_finished
    expect(increments).toEqual([1, 2]);
    expect(updates.at(-1)).toMatchObject({ status: 'SUCCESS', itemsSeen: 3 });
  });

  it('ігнорує run_id, якого немає в базі', async () => {
    await service.ingest(product({ run_id: 'missing' }));
    const snapshot = prisma.priceSnapshot.createMany.mock.calls[0][0];
    expect(snapshot.data[0].scrapeRunId).toBeNull();
    expect(prisma.scrapeRun.update).not.toHaveBeenCalled();
  });

  it('зіставляє товар з каталогом за штрихкодом', async () => {
    prisma.barcode.findMany.mockResolvedValue([
      { gtin: '05449000132499', variantId: 'variant-fanta' },
    ]);

    await service.ingest(
      product({ barcodes: ['5449000132499', '0250013065514', '11824797'] }),
    );

    const upsert = prisma.listing.upsert.mock.calls[0][0];
    // Внутрішні коди мережі та невалідні коди відкидаються
    expect(upsert.create.barcodes).toEqual(['05449000132499']);
    expect(prisma.barcode.findMany.mock.calls[0][0].where).toEqual({
      gtin: { in: ['05449000132499'] },
    });
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: { id: 'listing-1', variantId: null },
      data: expect.objectContaining({
        variantId: 'variant-fanta',
        matchStatus: 'AUTO_MATCHED',
        matchMethod: 'BARCODE',
        matchScore: 1,
      }),
    });
    expect(prisma.matchRuleHit.createMany).toHaveBeenCalledWith({
      data: [{ rule: 'barcode', listingId: 'listing-1', decision: 'barcode' }],
    });
  });

  it('правило «Збіг штрихкоду» вимкнене — картку лишає пакету', async () => {
    prisma.barcode.findMany.mockResolvedValue([
      { gtin: '05449000132499', variantId: 'variant-fanta' },
    ]);
    prisma.matchingRule.findUnique.mockResolvedValue({ enabled: false });

    await service.ingest(product({ barcodes: ['5449000132499'] }));

    expect(prisma.listing.updateMany).not.toHaveBeenCalled();
    expect(prisma.matchRuleHit.createMany).not.toHaveBeenCalled();
  });

  it('не шукає штрихкод, якщо картка вже зіставлена', async () => {
    prisma.listing.upsert.mockResolvedValue({
      id: 'listing-1',
      variantId: 'variant-1',
    });

    await service.ingest(product({ barcodes: ['5449000132499'] }));
    expect(prisma.barcode.findMany).not.toHaveBeenCalled();
  });

  it('штрихкоди ведуть до різних фасувань — не вгадує', async () => {
    prisma.barcode.findMany.mockResolvedValue([
      { gtin: '05449000132499', variantId: 'variant-a' },
      { gtin: '04820001234565', variantId: 'variant-b' },
    ]);
    await service.ingest(
      product({ barcodes: ['5449000132499', '4820001234565'] }),
    );
    expect(prisma.listing.updateMany).not.toHaveBeenCalled();
  });

  describe('ingestBatch', () => {
    it('пакет: один запит на наявні картки, одна транзакція, одна вставка історії', async () => {
      let n = 0;
      prisma.listing.upsert.mockImplementation(() =>
        Promise.resolve({ id: `listing-${++n}`, variantId: null }),
      );
      const items = ['1', '2', '3'].map((external) =>
        product({ external, run_id: RUN_ID }),
      );

      await expect(service.ingestBatch(items)).resolves.toEqual([
        'changed',
        'changed',
        'changed',
      ]);

      expect(prisma.listing.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.priceSnapshot.createMany).toHaveBeenCalledTimes(1);
      const snapshots = prisma.priceSnapshot.createMany.mock.calls[0][0]
        .data as Args[];
      expect(snapshots.map((d) => d.listingId)).toEqual([
        'listing-1',
        'listing-2',
        'listing-3',
      ]);
      // itemsChanged — одним оновленням на запуск, а не по одному на картку
      const changedUpdates = prisma.scrapeRun.update.mock.calls.filter(
        (c) => c[0].data.itemsChanged,
      );
      expect(changedUpdates).toHaveLength(1);
      expect(changedUpdates[0][0].data).toEqual({
        itemsChanged: { increment: 3 },
      });
    });

    it('змінені й незмінені картки в одному пакеті; результати в порядку входу', async () => {
      prisma.listing.findMany.mockResolvedValue([
        EXISTING,
        { ...EXISTING, id: 'listing-2', externalId: '2' },
      ]);
      const results = await service.ingestBatch([
        product({ price: 25 }),
        product({ external: '2', price: 30 }),
      ]);
      expect(results).toEqual(['unchanged', 'changed']);
      expect(prisma.listing.update).toHaveBeenCalledTimes(1);
      expect(prisma.listing.upsert).toHaveBeenCalledTimes(1);
      expect(
        prisma.priceSnapshot.createMany.mock.calls[0][0].data,
      ).toHaveLength(1);
    });

    it('некоректна картка чи невідома мережа не губить решту пакета', async () => {
      const results = await service.ingestBatch([
        product({ external: '1' }),
        product({ external: '2', price: 0 }),
        product({ external: '3', store: 'unknown' }),
        product({ external: '4' }),
      ]);
      expect(results).toEqual(['changed', 'skipped', 'skipped', 'changed']);
      expect(prisma.listing.upsert).toHaveBeenCalledTimes(2);
    });

    it('пакет без придатних карток нічого не пише', async () => {
      await expect(
        service.ingestBatch([product({ price: 0 })]),
      ).resolves.toEqual(['skipped']);
      expect(prisma.listing.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('дві версії однієї картки в пакеті пишуться по черзі', async () => {
      const results = await service.ingestBatch([
        product({ price: 25 }),
        product({ price: 30 }),
      ]);
      expect(results).toEqual(['changed', 'changed']);
      // Друга версія читає базу вже після запису першої
      expect(prisma.listing.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(
        prisma.listing.upsert.mock.calls.map((c) => c[0].update.currentPrice),
      ).toEqual([25, 30]);
    });

    it('штрихкоди всього пакета шукає одним запитом', async () => {
      let n = 0;
      prisma.listing.upsert.mockImplementation(() =>
        Promise.resolve({ id: `listing-${++n}`, variantId: null }),
      );
      prisma.barcode.findMany.mockResolvedValue([
        { gtin: '05449000132499', variantId: 'variant-fanta' },
        { gtin: '04820001234565', variantId: 'variant-b' },
      ]);

      await service.ingestBatch([
        product({ external: '1', barcodes: ['5449000132499'] }),
        product({ external: '2', barcodes: ['4820001234565'] }),
        product({ external: '3', barcodes: ['5449000132499'] }),
      ]);

      expect(prisma.barcode.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.barcode.findMany.mock.calls[0][0].where.gtin.in).toEqual([
        '05449000132499',
        '04820001234565',
      ]);
      expect(
        prisma.listing.updateMany.mock.calls.map((c) => [
          c[0].where.id,
          c[0].data.variantId,
        ]),
      ).toEqual([
        ['listing-1', 'variant-fanta'],
        ['listing-2', 'variant-b'],
        ['listing-3', 'variant-fanta'],
      ]);
      expect(prisma.matchRuleHit.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.matchRuleHit.createMany.mock.calls[0][0].data).toHaveLength(
        3,
      );
    });

    it('збій запису відкочує пакет і не рахує прогрес', async () => {
      prisma.listing.upsert.mockRejectedValueOnce(new Error('db down'));
      await expect(
        service.ingestBatch([product({ run_id: RUN_ID })]),
      ).rejects.toThrow('db down');
      await service.flushProgress();
      expect(prisma.scrapeRun.update).not.toHaveBeenCalled();
    });
  });

  describe('handleRunEvent', () => {
    it('запуск зі збійними товарами (dead-letter) завершується як PARTIAL', async () => {
      prisma.scrapeRun.findUnique.mockResolvedValue({
        id: RUN_ID,
        itemsFailed: 3,
      } as never);
      await service.handleRunEvent(
        event({ kind: 'run_finished', pages_fetched: 0, items_seen: 10 }),
      );
      expect(prisma.scrapeRun.update.mock.calls[0][0].data.status).toBe(
        'PARTIAL',
      );
    });

    it('після запуску зі сторінками оновлює дату перевірки robots.txt', async () => {
      prisma.scrapeRun.update.mockResolvedValueOnce({ chainId: 'chain-atb' });
      Object.assign(prisma.storeChain, { update: jest.fn() });
      await service.handleRunEvent(
        event({ kind: 'run_finished', pages_fetched: 5, items_seen: 10 }),
      );
      expect((prisma.storeChain as any).update).toHaveBeenCalledWith({
        where: { id: 'chain-atb' },
        data: { robotsCheckedAt: new Date('2026-10-11T10:00:00Z') },
      });
    });

    it('позначає запуск як RUNNING на старті', async () => {
      await service.handleRunEvent(event());
      expect(prisma.scrapeRun.update).toHaveBeenCalledWith({
        where: { id: RUN_ID },
        data: {
          status: 'RUNNING',
          startedAt: new Date('2026-10-11T10:00:00Z'),
        },
      });
    });

    it('зберігає лічильники та статус SUCCESS або PARTIAL', async () => {
      await service.handleRunEvent(
        event({ kind: 'run_finished', pages_fetched: 12, items_seen: 340 }),
      );
      expect(prisma.scrapeRun.update.mock.calls[0][0].data).toMatchObject({
        status: 'SUCCESS',
        pagesFetched: 12,
        itemsSeen: 340,
        error: null,
      });

      await service.handleRunEvent(
        event({ kind: 'run_finished', error: 'https://x → HTTP 500' }),
      );
      expect(prisma.scrapeRun.update.mock.calls[1][0].data).toMatchObject({
        status: 'PARTIAL',
        error: 'https://x → HTTP 500',
      });
    });

    it('зберігає помилку збою', async () => {
      await service.handleRunEvent(
        event({ kind: 'run_failed', error: 'сайт заблокував запит (403)' }),
      );
      expect(prisma.scrapeRun.update.mock.calls[0][0].data).toMatchObject({
        status: 'FAILED',
        error: 'сайт заблокував запит (403)',
      });
    });

    it('після завершення запуску ставить зіставлення в чергу', async () => {
      await service.handleRunEvent(event());
      expect(matching.schedule).not.toHaveBeenCalled();
      await service.handleRunEvent(event({ kind: 'run_finished' }));
      expect(matching.schedule).toHaveBeenCalledTimes(1);
    });

    it('ігнорує події без запуску в базі', async () => {
      await service.handleRunEvent(event({ run_id: null }));
      await service.handleRunEvent(event({ run_id: 'missing' }));
      expect(prisma.scrapeRun.update).not.toHaveBeenCalled();
    });
  });
});

describe('IngestionService.delistMissing', () => {
  const AT = new Date('2026-10-18T12:00:00Z');

  function setup(
    run: { chainId: string; maxPages: number | null } | null,
    active: number,
  ) {
    const prisma = {
      scrapeRun: { findUnique: jest.fn(() => Promise.resolve(run)) },
      listing: {
        count: jest.fn(() => Promise.resolve(active)),
        updateMany: jest.fn((_args: Args) => Promise.resolve({ count: 7 })),
      },
    };
    const service = new IngestionService(
      prisma as unknown as PrismaService,
      { schedule: jest.fn() } as unknown as MatchingService,
    );
    return { service, prisma };
  }

  beforeAll(() => Logger.overrideLogger(false));

  it('повний обхід знімає картки, яких у ньому не було', async () => {
    const { service, prisma } = setup(
      { chainId: 'chain-atb', maxPages: null },
      100,
    );
    await expect(service.delistMissing(RUN_ID, 90, AT)).resolves.toBe(7);
    const args = prisma.listing.updateMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      chainId: 'chain-atb',
      delistedAt: null,
    });
    expect(args.where.OR).toEqual([
      { lastRunId: null },
      { lastRunId: { not: RUN_ID } },
    ]);
    expect(args.data).toEqual({ delistedAt: AT, isOnPromo: false });
  });

  it('тестовий обхід (maxPages) нічого не знімає', async () => {
    const { service, prisma } = setup(
      { chainId: 'chain-atb', maxPages: 1 },
      100,
    );
    await expect(service.delistMissing(RUN_ID, 90, AT)).resolves.toBe(0);
    expect(prisma.listing.updateMany).not.toHaveBeenCalled();
  });

  it('обхід побачив мало (акційна мережа) — знімає лише давно не бачені', async () => {
    const { service, prisma } = setup(
      { chainId: 'chain-atb', maxPages: null },
      100,
    );
    await expect(service.delistMissing(RUN_ID, 10, AT)).resolves.toBe(7);
    const args = prisma.listing.updateMany.mock.calls[0][0];
    expect(args.where.lastSeenAt).toEqual({
      lt: new Date('2026-10-04T12:00:00Z'),
    });
  });

  it('обхід нічого не побачив — нічого не знімає', async () => {
    const { service, prisma } = setup(
      { chainId: 'chain-atb', maxPages: null },
      100,
    );
    await expect(service.delistMissing(RUN_ID, 0, AT)).resolves.toBe(0);
    expect(prisma.listing.updateMany).not.toHaveBeenCalled();
  });
});

describe('IngestionService.expirePromos', () => {
  const NOW = new Date('2026-10-18T12:00:00Z');

  function setup(listings: object[]) {
    const prisma = {
      listing: {
        findMany: jest.fn((_args: Args) => Promise.resolve(listings)),
        update: jest.fn((args: Args) => args),
      },
      priceSnapshot: { create: jest.fn((args: Args) => args) },
      $transaction: jest.fn((ops: unknown[]) => Promise.resolve(ops)),
    };
    const service = new IngestionService(
      prisma as unknown as PrismaService,
      { schedule: jest.fn() } as unknown as MatchingService,
    );
    return { service, prisma };
  }

  beforeAll(() => Logger.overrideLogger(false));

  it('шукає акції, що закінчились щонайменше 30 год тому', async () => {
    const { service, prisma } = setup([]);
    await service.expirePromos(NOW);
    const where = prisma.listing.findMany.mock.calls[0][0].where;
    expect(where.isOnPromo).toBe(true);
    expect(where.promoEndsAt.lte).toEqual(new Date('2026-10-17T06:00:00Z'));
  });

  it('повертає звичайну ціну й пише запис історії без акції', async () => {
    const { service, prisma } = setup([
      {
        id: 'l1',
        currentPrice: '19.99',
        regularPrice: '29.99',
        unitPrice: '39.98',
        inStock: true,
        measure: 'VOLUME',
        netQuantity: '500',
        packCount: 1,
        isWeighted: false,
      },
    ]);
    await expect(service.expirePromos(NOW)).resolves.toBe(1);
    expect(prisma.listing.update.mock.calls[0][0].data).toEqual({
      isOnPromo: false,
      promoEndsAt: null,
      currentPrice: 29.99,
      regularPrice: null,
      unitPrice: 59.98,
    });
    expect(prisma.priceSnapshot.create.mock.calls[0][0].data).toMatchObject({
      listingId: 'l1',
      price: 29.99,
      capturedAt: NOW,
    });
  });

  it('акція без закресленої ціни (картка лояльності) — ціна та сама, акцію знято', async () => {
    const { service, prisma } = setup([
      {
        id: 'l2',
        currentPrice: '49.90',
        regularPrice: null,
        unitPrice: '99.80',
        inStock: true,
        measure: 'VOLUME',
        netQuantity: '500',
        packCount: 1,
        isWeighted: false,
      },
    ]);
    await service.expirePromos(NOW);
    expect(prisma.listing.update.mock.calls[0][0].data).toMatchObject({
      isOnPromo: false,
      currentPrice: 49.9,
      unitPrice: 99.8,
    });
  });
});

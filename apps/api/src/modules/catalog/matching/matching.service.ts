import { errorText } from '../../../common/errors';
import { createHash, randomUUID } from 'node:crypto';
import {
  Optional,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  MATCHING_STATE_KEY,
  MatchingState,
  MatchReport,
} from '@repo/contracts';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { SearchIndexer } from '../search/search.indexer';
import { withFields } from '../../../logger';
import { createRedis } from '../../../redis';
import {
  CATEGORIES,
  productCategory,
  BrandDictionaries,
  brandKey,
  buildDictionaries,
  CatalogIndex,
  detectBrand,
  extractFeatures,
  Idf,
  idfFromCounts,
  lineOf,
  ListingInput,
  listingInput,
  MatchDecision,
  matchKeys,
  QuantityInfo,
  quantityKey,
  slugify,
  stripQuantity,
  variantLabel,
  variantLabelOf,
} from '@repo/matching';

const rowSelect = {
  id: true,
  chainId: true,
  rawName: true,
  rawBrand: true,
  imageUrl: true,
  barcodes: true,
  measure: true,
  netQuantity: true,
  packCount: true,
  isWeighted: true,
  delistedAt: true,
  chain: { select: { slug: true, countryCode: true } },
} satisfies Prisma.ListingSelect;

type Row = Prisma.ListingGetPayload<{ select: typeof rowSelect }>;

const quantitySelect = {
  measure: true,
  netQuantity: true,
  packCount: true,
  isWeighted: true,
} satisfies Prisma.ProductVariantSelect;

/** Словник брендів, IDF і написання брендів — за назвами всіх карток */
interface Vocabulary {
  builtAt: number;
  dictionaries: BrandDictionaries;
  idfs: Map<string, Idf>;
  /** Як бренд записаний у мережах: ключ → перша назва ("coca-cola" → "Coca-Cola") */
  brandNames: Map<string, string>;
}

/**
 * Як часто оновлювати словник брендів і IDF. Дешево: частоти слів рахує PostgreSQL
 * з listings.nameTokens, у памʼять приходить лише словник, а не всі картки.
 */
const VOCABULARY_TTL_MS = 60 * 60 * 1000;
/** Відбиток словника брендів: змінився — слова карток без бренду рахуються заново */
const BRAND_DICTIONARY_KEY = 'matching:brand-dictionary';
/** Скільки фасувань / карток обробляти за раз під час заповнення match_keys */
const KEYS_CHUNK = 2000;
/** Не більше стількох значень в одному `IN (...)` */
const IN_CHUNK = 5000;

/**
 * Зіставлення карток мереж з каталогом (docs/02-database.md):
 *   1. штрихкод уже відомий → те саме фасування;
 *   2. нечітка схожість назви ≥ 0,90 з фасуванням того самого розміру → те саме фасування;
 *   3. 0,70–0,90 → кандидати в чергу модерації;
 *   4. той самий бренд і назва, але інше фасування → нове фасування товару;
 *   5. інакше → новий товар у каталозі.
 *
 * Інкрементально: каталог — постійна база, а кожен пакет читає лише нові картки й ті
 * фасування, з якими вони мають спільний ключ пошуку (match_keys: фасування + слово,
 * бренд) або штрихкод. Рішення ті самі, що й при завантаженні всього каталогу, бо
 * CatalogIndex і так порівнює картку лише з фасуваннями своїх блоків.
 *
 * Працює у воркері (src/worker.ts): після кожного запуску парсера і на запит API
 * (черга matching:requests). Стан публікує в Redis (matching:state) для API.
 */
@Injectable()
export class MatchingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchingService.name);
  private readonly redis = createRedis();
  private current: Promise<MatchReport> | null = null;
  private again = false;
  private last: MatchReport | null = null;
  private vocabulary: Vocabulary | null = null;

  constructor(
    private readonly prisma: PrismaService,
    // У воркері — індекс пошуку; в інтеграційних тестах його немає
    @Optional() private readonly search?: SearchIndexer,
  ) {}

  /** Останній звіт — з журналу match_runs, щоб статус переживав перезапуск воркера */
  async onModuleInit() {
    try {
      const run = await this.prisma.matchRun.findFirst({
        orderBy: { startedAt: 'desc' },
      });
      if (run && !this.last) {
        const { id: _id, ...counts } = run;
        this.last = {
          ...counts,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt.toISOString(),
        };
      }
      await this.publish();
    } catch (error) {
      this.logger.warn(
        `Не вдалося прочитати журнал зіставлення: ${errorText(error)}`,
      );
    }
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  get running(): boolean {
    return this.current !== null;
  }

  /** Запустити у фоні; якщо зіставлення вже йде — повторити після нього */
  schedule(): void {
    void this.run().catch((error: unknown) =>
      this.logger.error(`Зіставлення впало: ${errorText(error)}`),
    );
  }

  run(): Promise<MatchReport> {
    if (this.current) {
      this.again = true;
      return this.current;
    }
    this.current = this.execute().finally(() => {
      this.current = null;
      void this.publish();
      if (this.again) {
        this.again = false;
        this.schedule();
      }
    });
    void this.publish();
    return this.current;
  }

  /** Стан для API: GET /api/v1/matching/status */
  private async publish(): Promise<void> {
    const state: MatchingState = {
      running: this.running,
      lastReport: this.last,
      updatedAt: new Date().toISOString(),
    };
    try {
      await this.redis.set(MATCHING_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      this.logger.warn(`Не вдалося опублікувати стан: ${errorText(error)}`);
    }
  }

  private async execute(): Promise<MatchReport> {
    const startedAt = new Date();
    const vocabulary = await this.loadVocabulary();
    await this.syncKeys(vocabulary);

    const rows = await this.prisma.listing.findMany({
      where: {
        variantId: null,
        matchStatus: 'PENDING',
        matchCandidates: { none: { status: 'SUGGESTED' } },
      },
      select: rowSelect,
    });
    const inputs = new Map(
      rows.map((row) => [row.id, toInput(row, vocabulary.dictionaries)]),
    );
    const index = new CatalogIndex();
    for (const [country, idf] of vocabulary.idfs) index.setIdf(country, idf);
    await this.loadCandidates(index, [...inputs.values()], vocabulary);

    const report: MatchReport = {
      startedAt: startedAt.toISOString(),
      finishedAt: '',
      processed: 0,
      byBarcode: 0,
      fuzzy: 0,
      review: 0,
      newVariants: 0,
      newProducts: 0,
      skipped: 0,
      failed: 0,
    };

    // Спершу картки зі штрихкодами: вони створюють надійні "якорі" для решти
    const pending = rows.sort(
      (a, b) =>
        Number(b.barcodes.length > 0) - Number(a.barcodes.length > 0) ||
        a.chain.slug.localeCompare(b.chain.slug) ||
        a.rawName.localeCompare(b.rawName),
    );

    for (const row of pending) {
      const listing = inputs.get(row.id)!;
      const decision = index.decide(listing);
      try {
        await this.apply(decision, row, listing, index, vocabulary);
      } catch (error) {
        // Одна картка не зупиняє весь пакет
        if (error instanceof StaleListing) report.skipped++;
        else {
          report.failed++;
          this.logger.error(
            `Картка ${row.id} (${row.rawName}): ${errorText(error)}`,
          );
        }
        continue;
      }
      report.processed++;
      if (decision.kind === 'barcode') report.byBarcode++;
      else if (decision.kind === 'fuzzy') report.fuzzy++;
      else if (decision.kind === 'review') report.review++;
      else if (decision.kind === 'variant') report.newVariants++;
      else report.newProducts++;
    }

    await this.refreshProductStats();
    await this.assignCategories().catch((error: unknown) =>
      this.logger.error(`Категорії: ${errorText(error)}`),
    );
    // Пошук без Meilisearch працює через SQL, тож збій індексу — лише попередження
    await this.search
      ?.reindex()
      .catch((error: unknown) =>
        this.logger.warn(`Пошуковий індекс: ${errorText(error)}`),
      );
    report.finishedAt = new Date().toISOString();
    this.last = report;
    await this.prisma.matchRun
      .create({
        data: {
          ...report,
          startedAt: new Date(report.startedAt),
          finishedAt: new Date(report.finishedAt),
        },
      })
      .catch((error: unknown) =>
        this.logger.warn(`Звіт не записано в журнал: ${errorText(error)}`),
      );
    this.logger.log(withFields('Пакет зіставлення', { ...report }));
    return report;
  }

  /**
   * Словник брендів і IDF. Бренди — DISTINCT з карток; слова кожної картки рахуються
   * один раз (listings.nameTokens) і перераховуються, коли змінилась назва або словник;
   * частоти слів по країнах — одним GROUP BY у PostgreSQL.
   */
  private async loadVocabulary(): Promise<Vocabulary> {
    if (
      this.vocabulary &&
      Date.now() - this.vocabulary.builtAt < VOCABULARY_TTL_MS
    ) {
      return this.vocabulary;
    }
    const brands = await this.prisma.$queryRaw<
      { country: string; rawBrand: string; n: number }[]
    >`
      SELECT c."countryCode" AS country, l."rawBrand" AS "rawBrand", count(*)::int AS n
      FROM listings l JOIN store_chains c ON c.id = l."chainId"
      WHERE l."rawBrand" IS NOT NULL
      GROUP BY 1, 2
      ORDER BY n DESC, 2`;
    const dictionaries = buildDictionaries(brands);
    // Як бренд записаний найчастіше: ключ → назва ("coca-cola" → "Coca-Cola")
    const brandNames = new Map<string, string>();
    for (const { rawBrand } of brands) {
      const key = brandKey(rawBrand);
      if (key && !brandNames.has(key)) brandNames.set(key, rawBrand.trim());
    }

    const signature = createHash('sha1')
      .update(
        [...dictionaries]
          .flatMap(([country, entries]) =>
            entries.map((e) => `${country}:${e.key}:${e.words.join(' ')}`),
          )
          .sort()
          .join('\n'),
      )
      .digest('hex');
    const known = await this.redis.get(BRAND_DICTIONARY_KEY).catch(() => null);
    if (known !== signature) {
      // Новий бренд у словнику може бути в назвах карток без бренду
      await this.prisma.listing.updateMany({
        where: { rawBrand: null },
        data: { tokenizedAt: null },
      });
    }
    await this.tokenize(dictionaries);
    if (known !== signature) {
      await this.redis.set(BRAND_DICTIONARY_KEY, signature).catch(() => null);
    }

    const [frequencies, totals] = await Promise.all([
      this.prisma.$queryRaw<{ country: string; token: string; df: number }[]>`
        SELECT country, token, count(*)::int AS df FROM (
          SELECT DISTINCT l.id, c."countryCode" AS country, t.token
          FROM listings l
          JOIN store_chains c ON c.id = l."chainId"
          CROSS JOIN LATERAL unnest(l."nameTokens") AS t(token)
        ) d
        GROUP BY country, token`,
      this.prisma.$queryRaw<{ country: string; total: number }[]>`
        SELECT c."countryCode" AS country, count(*)::int AS total
        FROM listings l JOIN store_chains c ON c.id = l."chainId"
        GROUP BY 1`,
    ]);
    const df = new Map<string, Map<string, number>>();
    for (const row of frequencies) {
      const counts = df.get(row.country) ?? new Map<string, number>();
      counts.set(row.token, row.df);
      df.set(row.country, counts);
    }
    this.vocabulary = {
      builtAt: Date.now(),
      dictionaries,
      idfs: new Map(
        totals.map(({ country, total }) => [
          country,
          idfFromCounts(total, df.get(country) ?? new Map<string, number>()),
        ]),
      ),
      brandNames,
    };
    return this.vocabulary;
  }

  /** Значущі слова назв карток, для яких їх ще не пораховано (listings.nameTokens) */
  private async tokenize(dictionaries: BrandDictionaries): Promise<void> {
    let done = 0;
    for (;;) {
      const rows = await this.prisma.listing.findMany({
        where: { tokenizedAt: null },
        select: {
          id: true,
          rawName: true,
          rawBrand: true,
          chain: { select: { countryCode: true } },
        },
        take: KEYS_CHUNK,
      });
      if (rows.length === 0) break;
      const data = rows.map((row) => ({
        id: row.id,
        tokens: detectBrand(
          extractFeatures(row.rawName, row.rawBrand),
          dictionaries.get(row.chain.countryCode) ?? [],
        ).tokens.map((t) => t.norm),
      }));
      const updated = await this.prisma.$executeRaw`
        UPDATE listings l
        SET "nameTokens" = v.tokens, "tokenizedAt" = now()
        FROM jsonb_to_recordset(${JSON.stringify(data)}::jsonb) AS v(id text, tokens text[])
        WHERE l.id = v.id`;
      // Інакше той самий пакет вибирався б знову й знову
      if (updated < rows.length) {
        throw new Error(`nameTokens: оновлено ${updated} з ${rows.length}`);
      }
      done += rows.length;
    }
    if (done > 0) this.logger.log(`Слова назв пораховано: ${done} карток`);
  }

  /**
   * Дописує ключі пошуку, яких бракує: для назв фасувань і карток, зіставлених поза
   * пакетом (модератор, прийом даних за штрихкодом), і разово — для каталогу, створеного
   * до появи match_keys.
   */
  private async syncKeys(vocabulary: Vocabulary): Promise<void> {
    let added = 0;
    for (;;) {
      const variants = await this.prisma.productVariant.findMany({
        where: { matchKeys: { none: { listingId: null } } },
        select: {
          id: true,
          ...quantitySelect,
          product: {
            select: { name: true, brand: { select: { name: true } } },
          },
        },
        take: KEYS_CHUNK,
      });
      if (variants.length === 0) break;
      const data = variants.flatMap((v) =>
        productKeys(v.id, toQuantity(v), v.product.name, v.product.brand?.name),
      );
      await this.prisma.matchKey.createMany({ data });
      added += data.length;
    }
    for (;;) {
      const listings = await this.prisma.listing.findMany({
        where: { variantId: { not: null }, matchKeys: { none: {} } },
        select: {
          ...rowSelect,
          variant: { select: { id: true, ...quantitySelect } },
        },
        take: KEYS_CHUNK,
      });
      if (listings.length === 0) break;
      const data = listings.flatMap((row) =>
        listingKeys(
          row.variant!.id,
          toQuantity(row.variant!),
          row.id,
          toInput(row, vocabulary.dictionaries),
        ),
      );
      await this.prisma.matchKey.createMany({ data });
      added += data.length;
    }
    if (added > 0) this.logger.log(`Ключі пошуку дописано: ${added}`);
  }

  /**
   * Лічильники сторінки каталогу (product_stats). Пакет запускається після кожної зміни
   * каталогу — зіставлення, рішення модератора, зняття зниклих карток, — тож тут вони
   * й оновлюються; CONCURRENTLY не блокує читання каталогу під час перерахунку.
   */
  /**
   * Категорія кожного товару — найчастіша серед його карток (правила в @repo/matching).
   * shortcut: перераховує весь каталог після кожного пакета (~10 тис. карток, частки секунди);
   * для мільйонів — лише товари, чиї картки змінились.
   */
  private async assignCategories(): Promise<void> {
    await this.prisma.category.createMany({
      data: [...CATEGORIES],
      skipDuplicates: true,
    });
    const ids = new Map(
      (
        await this.prisma.category.findMany({
          select: { id: true, slug: true },
        })
      ).map((c) => [c.slug, c.id]),
    );
    const rows = await this.prisma.$queryRaw<
      { productId: string; rawCategory: string | null; rawName: string }[]
    >`
      SELECT v."productId", l."rawCategory", l."rawName"
      FROM listings l JOIN product_variants v ON v.id = l."variantId"
      WHERE l."delistedAt" IS NULL`;
    const byProduct = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byProduct.get(row.productId) ?? [];
      list.push(row);
      byProduct.set(row.productId, list);
    }
    const byCategory = new Map<string | null, string[]>();
    for (const [productId, listings] of byProduct) {
      const categoryId = ids.get(productCategory(listings) ?? '') ?? null;
      byCategory.set(categoryId, [
        ...(byCategory.get(categoryId) ?? []),
        productId,
      ]);
    }
    for (const [categoryId, productIds] of byCategory) {
      await this.prisma.product.updateMany({
        where: {
          id: { in: productIds },
          // Лише ті, що змінились; NULL явно, бо NOT (categoryId = x) для NULL — не true
          ...(categoryId
            ? {
                OR: [{ categoryId: null }, { categoryId: { not: categoryId } }],
              }
            : { categoryId: { not: null } }),
        },
        data: { categoryId },
      });
    }
  }

  private async refreshProductStats(): Promise<void> {
    try {
      await this.prisma
        .$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY product_stats`;
    } catch (error) {
      this.logger.error(`product_stats: ${errorText(error)}`);
    }
  }

  /** Лише ті фасування, що можуть збігтися з новими картками → індекс у памʼяті */
  private async loadCandidates(
    index: CatalogIndex,
    inputs: ListingInput[],
    vocabulary: Vocabulary,
  ): Promise<void> {
    if (inputs.length === 0) return;
    const gtins = [...new Set(inputs.flatMap((l) => l.barcodes))];
    const keys = [
      ...new Set(
        inputs.flatMap((l) => matchKeys(quantityKey(l.quantity), l.features)),
      ),
    ];
    const [owners, keyed, rejected] = await Promise.all([
      inChunks(gtins, (part) =>
        this.prisma.barcode.findMany({
          where: { gtin: { in: part } },
          select: { variant: { select: { productId: true } } },
        }),
      ),
      inChunks(keys, (part) =>
        this.prisma.matchKey.findMany({
          where: { key: { in: part } },
          select: { variant: { select: { productId: true } } },
          distinct: ['variantId'],
        }),
      ),
      inChunks(
        inputs.map((l) => l.id),
        (part) =>
          this.prisma.matchCandidate.findMany({
            where: {
              listingId: { in: part },
              status: 'REJECTED',
              variantId: { not: null },
            },
            select: { listingId: true, variantId: true },
          }),
      ),
    ]);
    for (const { listingId, variantId } of rejected)
      if (variantId) index.reject(listingId, variantId);

    // Цілі товари: щоб знати всі їхні фасування ("такого розміру ще немає")
    const productIds = [
      ...new Set([...owners, ...keyed].map((k) => k.variant.productId)),
    ];
    const variants = await inChunks(productIds, (part) =>
      this.prisma.productVariant.findMany({
        where: { productId: { in: part } },
        select: {
          id: true,
          productId: true,
          ...quantitySelect,
          barcodes: { select: { gtin: true } },
          product: {
            select: { name: true, brand: { select: { name: true } } },
          },
          listings: { select: rowSelect },
        },
      }),
    );

    for (const variant of variants) {
      const productFeatures = extractFeatures(
        variant.product.name,
        variant.product.brand?.name,
      );
      const linked = variant.listings.map((row) =>
        toInput(row, vocabulary.dictionaries),
      );
      const countries = new Set(linked.map((l) => l.country));
      for (const country of countries) {
        index.addProduct(variant.productId, productFeatures, country);
      }
      index.addVariant(
        variant.id,
        variant.productId,
        quantityKey(toQuantity(variant)),
      );
      for (const { gtin } of variant.barcodes)
        index.addBarcode(variant.id, gtin);
      for (const country of countries) {
        index.addName(variant.id, productFeatures, country);
      }
      variant.listings.forEach((row, i) => {
        const listing = linked[i];
        // Мережа «зайнята» лише активною карткою: знята (ALDI щотижня перевиставляє товар
        // з новим ID) не заважає новій картці тієї ж мережі приєднатися до свого товару —
        // інакше дублікат товару і розірвана історія цін. Назва знятої картки лишається в індексі
        index.addName(
          variant.id,
          listing.features,
          listing.country,
          row.delistedAt ? undefined : listing.chainId,
        );
      });
    }
  }

  private async apply(
    decision: MatchDecision,
    row: Row,
    listing: ListingInput,
    index: CatalogIndex,
    vocabulary: Vocabulary,
  ): Promise<void> {
    const now = new Date();
    const auto = (
      variantId: string,
      method: 'BARCODE' | 'FUZZY' | 'CREATED',
      score: number,
    ) => ({
      variantId,
      matchStatus: 'AUTO_MATCHED' as const,
      matchMethod: method,
      matchScore: score,
      matchedAt: now,
    });

    switch (decision.kind) {
      case 'barcode':
      case 'fuzzy': {
        const score = decision.kind === 'fuzzy' ? decision.score : 1;
        await this.prisma.$transaction(async (tx) => {
          await claim(
            tx,
            row.id,
            auto(
              decision.variantId,
              decision.kind === 'fuzzy' ? 'FUZZY' : 'BARCODE',
              score,
            ),
          );
          await this.barcodesFor(decision.variantId, row, index, tx);
          await tx.matchKey.createMany({
            data: listingKeys(
              decision.variantId,
              listing.quantity,
              row.id,
              listing,
              index.variantOf(decision.variantId)?.quantityKey,
            ),
          });
        });
        this.register(index, decision.variantId, row, listing);
        return;
      }
      case 'review': {
        await this.prisma.matchCandidate.createMany({
          data: decision.candidates.map((c) => ({
            listingId: row.id,
            variantId: c.variantId,
            score: c.score,
            details: {
              name: c.name,
              brand: c.brand,
              barcodeMismatch: c.barcodeMismatch ?? false,
            },
          })),
          skipDuplicates: true,
        });
        return;
      }
      case 'variant': {
        try {
          const variant = await this.prisma.$transaction(async (tx) => {
            const created = await tx.productVariant.create({
              data: { productId: decision.productId, ...variantData(listing) },
            });
            // Картка — перша в новому фасуванні; схожість із товаром лишається в matchScore
            await claim(
              tx,
              row.id,
              auto(created.id, 'CREATED', decision.score),
            );
            await this.barcodesFor(created.id, row, index, tx);
            const product = await tx.product.findUniqueOrThrow({
              where: { id: decision.productId },
              select: { name: true, brand: { select: { name: true } } },
            });
            await tx.matchKey.createMany({
              data: [
                ...productKeys(
                  created.id,
                  listing.quantity,
                  product.name,
                  product.brand?.name,
                ),
                ...listingKeys(created.id, listing.quantity, row.id, listing),
              ],
            });
            return created;
          });
          index.addVariant(
            variant.id,
            decision.productId,
            quantityKey(listing.quantity),
          );
          this.register(index, variant.id, row, listing);
          return;
        } catch (error) {
          // Фасування такого розміру вже є (ваговий і фасований 1 кг) — окремий товар
          if (!isUniqueViolation(error)) throw error;
        }
        await this.createProduct(row, listing, index, vocabulary);
        return;
      }
      case 'product':
        await this.createProduct(row, listing, index, vocabulary);
        return;
    }
  }

  /** Новий товар (з лінійкою бренду) і фасування з картки мережі */
  private async createProduct(
    row: Row,
    listing: ListingInput,
    index: CatalogIndex,
    vocabulary: Vocabulary,
  ): Promise<void> {
    const features = listing.features;
    const name = stripQuantity(row.rawName) || row.rawName;
    const brandName = features.brand
      ? (vocabulary.brandNames.get(features.brand) ??
        row.rawBrand ??
        features.brand)
      : null;
    const variantLabel = variantLabelOf(features);

    const result = await this.prisma.$transaction(async (tx) => {
      let brandId: string | null = null;
      let lineId: string | null = null;
      if (features.brand && brandName) {
        const brand = await tx.brand.upsert({
          where: { slug: features.brand },
          create: { slug: features.brand, name: brandName },
          update: {},
        });
        brandId = brand.id;
        const line = lineOf(features, brandName);
        const created = await tx.productLine.upsert({
          where: { slug: line.slug },
          create: { slug: line.slug, name: line.name, brandId },
          update: {},
        });
        lineId = created.id;
      }

      const product = await tx.product.create({
        data: {
          name,
          slug: `${slugify(`${brandName ?? ''} ${name}`).slice(0, 80)}-${randomUUID().slice(0, 6)}`,
          variantLabel,
          imageUrl: row.imageUrl,
          brandId,
          lineId,
          variants: { create: variantData(listing) },
        },
        include: { variants: true },
      });
      const created = product.variants[0];
      await claim(tx, row.id, {
        variantId: created.id,
        matchStatus: 'AUTO_MATCHED',
        matchMethod: 'CREATED',
        matchScore: 1,
        matchedAt: new Date(),
      });
      await this.barcodesFor(created.id, row, index, tx);
      await tx.matchKey.createMany({
        data: [
          ...productKeys(created.id, listing.quantity, name, brandName),
          ...listingKeys(created.id, listing.quantity, row.id, listing),
        ],
      });
      return { variant: created, productId: product.id };
    });
    const { variant, productId } = result;

    index.addProduct(productId, features, listing.country);
    index.addVariant(variant.id, productId, quantityKey(listing.quantity));
    this.register(index, variant.id, row, listing);
  }

  /** Штрихкоди картки, яких ще немає в каталозі */
  private unknownBarcodes(row: Row, index: CatalogIndex): string[] {
    return row.barcodes.filter((gtin) => !index.barcodeOwner(gtin));
  }

  private async barcodesFor(
    variantId: string,
    row: Row,
    index: CatalogIndex,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const gtins = this.unknownBarcodes(row, index);
    if (gtins.length === 0) return;
    await tx.barcode.createMany({
      data: gtins.map((gtin) => ({ gtin, variantId, source: row.chain.slug })),
      skipDuplicates: true,
    });
  }

  /** Картка тепер частина фасування: її назва й штрихкоди допомагають наступним */
  private register(
    index: CatalogIndex,
    variantId: string,
    row: Row,
    listing: ListingInput,
  ) {
    for (const gtin of row.barcodes) index.addBarcode(variantId, gtin);
    index.addName(
      variantId,
      listing.features,
      listing.country,
      listing.chainId,
    );
  }
}

/** Картку вже зіставив хтось інший (модератор, прийом даних) — знімок пакета застарів */
export class StaleListing extends Error {}

/** Записує рішення, лише якщо картка досі не зіставлена; інакше відкочує транзакцію */
export async function claim(
  tx: Prisma.TransactionClient,
  listingId: string,
  data: Prisma.ListingUpdateManyMutationInput & { variantId: string },
): Promise<void> {
  const { count } = await tx.listing.updateMany({
    where: { id: listingId, variantId: null },
    data,
  });
  if (count === 0) throw new StaleListing();
}

function toQuantity(v: {
  measure: QuantityInfo['measure'];
  netQuantity: Prisma.Decimal | null;
  packCount: number | null;
  isWeighted: boolean;
}): QuantityInfo {
  return {
    measure: v.measure,
    netQuantity: v.netQuantity === null ? null : Number(v.netQuantity),
    packCount: v.packCount ?? 1,
    isWeighted: v.isWeighted,
  };
}

function toInput(row: Row, dictionaries: BrandDictionaries): ListingInput {
  return listingInput(
    { ...row, country: row.chain.countryCode, ...toQuantity(row) },
    dictionaries,
  );
}

/** Ключі з назви товару — так, як її бачить CatalogIndex (extractFeatures(name, brand)) */
function productKeys(
  variantId: string,
  quantity: QuantityInfo,
  name: string,
  brand?: string | null,
) {
  return matchKeys(quantityKey(quantity), extractFeatures(name, brand)).map(
    (key) => ({ key, variantId, listingId: null }),
  );
}

/** Ключі з назви зіставленої картки; фасування — те, до якого її приєднано */
function listingKeys(
  variantId: string,
  quantity: QuantityInfo,
  listingId: string,
  listing: ListingInput,
  variantQuantityKey = quantityKey(quantity),
) {
  return matchKeys(variantQuantityKey, listing.features).map((key) => ({
    key,
    variantId,
    listingId,
  }));
}

/** Великий `IN (...)` — кількома запитами */
async function inChunks<T, R>(
  values: T[],
  query: (part: T[]) => Promise<R[]>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    results.push(...(await query(values.slice(i, i + IN_CHUNK))));
  }
  return results;
}

function variantData(listing: ListingInput) {
  return { ...listing.quantity, label: variantLabel(listing.quantity) };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

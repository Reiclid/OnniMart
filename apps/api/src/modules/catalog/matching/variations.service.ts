import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { clampPageSize, pageOf } from '../../../common/query';
import type {
  SetVariationDto,
  VariationPageDto,
  VariationWordDto,
} from '../dto/variations.dto';
import { MatchingClient } from './matching.client';
import {
  matchesFilter,
  mergeWords,
  normalizeSearch,
  normalizeWord,
  sortWords,
  WORD_STATUSES,
  WordFilter,
  WordSort,
} from './variation-words';

const FILTERS: WordFilter[] = ['active', 'all', ...WORD_STATUSES];
const SORTS: WordSort[] = ['products', 'contrast', 'weight', 'word'];

/** PRD-30: перегляд вивчених слів варіацій і ручні рішення модераторів (/admin/variations) */
@Injectable()
export class VariationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingClient,
  ) {}

  async list(query: {
    filter?: string;
    sort?: string;
    search?: string;
    page?: unknown;
    pageSize?: unknown;
  }): Promise<VariationPageDto> {
    const filter = FILTERS.find((f) => f === query.filter) ?? 'active';
    const sort = SORTS.find((s) => s === query.sort) ?? 'products';
    const search = normalizeSearch(query.search);
    const page = pageOf(query.page);
    const pageSize = clampPageSize(query.pageSize, 50);

    const [snapshot, overrides] = await Promise.all([
      this.matching.variations(),
      this.prisma.variationOverride.findMany({
        select: { word: true, action: true, note: true },
      }),
    ]);
    const merged = mergeWords(snapshot, overrides);
    const counts = { learned: 0, added: 0, removed: 0, candidate: 0 };
    for (const row of merged) counts[row.status]++;

    const filtered = merged.filter((r) => matchesFilter(r, filter, search));
    const usage = await this.usage(filtered.map((r) => r.word));
    const sorted = sortWords(
      filtered.map((r) => ({
        ...r,
        listings: usage.get(r.word)?.listings ?? 0,
        products: usage.get(r.word)?.products ?? 0,
      })),
      sort,
    );
    const slice = sorted.slice((page - 1) * pageSize, page * pageSize);
    const examples = await this.examples(slice.map((r) => r.word));
    return {
      items: slice.map((r): VariationWordDto => ({
        ...r,
        examples: examples.get(r.word) ?? [],
      })),
      total: sorted.length,
      page,
      pageSize,
      counts,
      builtAt: snapshot?.builtAt ?? null,
      minContrast: snapshot?.minContrast ?? 2,
      minWeight: snapshot?.minWeight ?? 0.75,
    };
  }

  async set(input: string, dto: SetVariationDto): Promise<void> {
    const word = normalizeWord(input);
    if (!word) {
      throw new BadRequestException(
        'Потрібне одне слово без цифр, напр. «stracciatella»',
      );
    }
    const note = dto.note?.trim() || null;
    await this.prisma.variationOverride.upsert({
      where: { word },
      create: { word, action: dto.action, note },
      update: { action: dto.action, note },
    });
  }

  async remove(input: string): Promise<void> {
    const word = normalizeWord(input) ?? input;
    const { count } = await this.prisma.variationOverride.deleteMany({
      where: { word },
    });
    if (count === 0) {
      throw new NotFoundException(`Ручне рішення для «${word}» не знайдено`);
    }
  }

  /** Активні картки й товари, у назвах яких є слово (listings.nameTokens) */
  private async usage(words: string[]) {
    const result = new Map<string, { listings: number; products: number }>();
    if (words.length === 0) return result;
    const rows = await this.prisma.$queryRaw<
      { word: string; listings: number; products: number }[]
    >(Prisma.sql`
      SELECT t.token AS word, count(DISTINCT l.id)::int AS listings,
        count(DISTINCT v."productId")::int AS products
      FROM listings l
      CROSS JOIN LATERAL unnest(l."nameTokens") AS t(token)
      LEFT JOIN product_variants v ON v.id = l."variantId"
      WHERE l."delistedAt" IS NULL AND t.token = ANY(${words})
      GROUP BY 1`);
    for (const r of rows) result.set(r.word, r);
    return result;
  }

  /** До 3 назв товарів (або карток без товару) з цим словом — щоб видно, що воно розрізняє */
  private async examples(words: string[]) {
    const result = new Map<string, string[]>();
    if (words.length === 0) return result;
    const rows = await this.prisma.$queryRaw<
      { word: string; names: string[] }[]
    >(Prisma.sql`
      SELECT word, (array_agg(DISTINCT name))[1:3] AS names FROM (
        SELECT t.token AS word, coalesce(p.name, l."rawName") AS name
        FROM listings l
        CROSS JOIN LATERAL unnest(l."nameTokens") AS t(token)
        LEFT JOIN product_variants v ON v.id = l."variantId"
        LEFT JOIN products p ON p.id = v."productId"
        WHERE l."delistedAt" IS NULL AND t.token = ANY(${words})
      ) x
      GROUP BY word`);
    for (const r of rows) result.set(r.word, r.names);
    return result;
  }
}

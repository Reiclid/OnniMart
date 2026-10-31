import { Injectable, NotFoundException } from '@nestjs/common';
import { isMatchRule, MATCH_RULES } from '@repo/matching';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { clampPageSize, pageOf } from '../../../common/query';
import type { MatchingRulesDto, RuleHitPageDto } from '../dto/rules.dto';
import { RULE_HITS_DAYS, ruleHitsCutoff } from './rule-hits';

const DECISIONS = ['barcode', 'fuzzy', 'review', 'variant', 'product'];

/** Правила зіставлення: перемикачі й на які картки вони вплинули (/admin/rules) */
@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(now = new Date()): Promise<MatchingRulesDto> {
    const cutoff = ruleHitsCutoff(now);
    const [switches, lastRun, counts] = await Promise.all([
      this.prisma.matchingRule.findMany(),
      this.prisma.matchRun.findFirst({
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      }),
      this.prisma.matchRuleHit.groupBy({
        by: ['rule', 'decision'],
        where: { createdAt: { gte: cutoff } },
        _count: { _all: true },
      }),
    ]);
    const lastBatch = lastRun
      ? await this.prisma.matchRuleHit.groupBy({
          by: ['rule'],
          where: { createdAt: { gte: lastRun.startedAt } },
          _count: { _all: true },
        })
      : [];
    return {
      days: RULE_HITS_DAYS,
      lastBatchAt: lastRun?.startedAt.toISOString() ?? null,
      items: MATCH_RULES.map((rule) => {
        const row = switches.find((s) => s.key === rule.key);
        const mine = counts.filter((c) => c.rule === rule.key);
        return {
          key: rule.key,
          title: rule.title,
          description: rule.description,
          enabled: row?.enabled ?? true,
          updatedAt: row?.updatedAt.toISOString() ?? null,
          hits: mine.reduce((sum, c) => sum + c._count._all, 0),
          lastBatch:
            lastBatch.find((c) => c.rule === rule.key)?._count._all ?? 0,
          byDecision: mine
            .map((c) => ({ decision: c.decision, count: c._count._all }))
            .sort((a, b) => b.count - a.count),
        };
      }),
    };
  }

  async hits(
    key: string,
    query: { decision?: string; page?: unknown; pageSize?: unknown },
    now = new Date(),
  ): Promise<RuleHitPageDto> {
    this.assertRule(key);
    const page = pageOf(query.page);
    const pageSize = clampPageSize(query.pageSize, 50);
    const where: Prisma.MatchRuleHitWhereInput = {
      rule: key,
      createdAt: { gte: ruleHitsCutoff(now) },
      ...(query.decision &&
        DECISIONS.includes(query.decision) && { decision: query.decision }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.matchRuleHit.count({ where }),
      this.prisma.matchRuleHit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          decision: true,
          createdAt: true,
          listing: {
            select: {
              id: true,
              rawName: true,
              chain: { select: { name: true } },
              variant: {
                select: { product: { select: { id: true, name: true } } },
              },
            },
          },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((r) => ({
        listingId: r.listing.id,
        name: r.listing.rawName,
        chain: r.listing.chain.name,
        decision: r.decision,
        productId: r.listing.variant?.product.id ?? null,
        product: r.listing.variant?.product.name ?? null,
        at: r.createdAt.toISOString(),
      })),
    };
  }

  async set(key: string, enabled: boolean): Promise<void> {
    this.assertRule(key);
    await this.prisma.matchingRule.upsert({
      where: { key },
      create: { key, enabled },
      update: { enabled },
    });
  }

  private assertRule(key: string): void {
    if (!isMatchRule(key)) {
      throw new NotFoundException(`Правило «${key}» не знайдено`);
    }
  }
}

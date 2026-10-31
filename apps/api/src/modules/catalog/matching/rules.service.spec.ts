import { NotFoundException } from '@nestjs/common';
import { MATCH_RULES } from '@repo/matching';
import type { PrismaService } from '../../../prisma/prisma.service';
import { hitsOf, ruleSwitches } from './rule-hits';
import { RulesService } from './rules.service';

describe('rule-hits', () => {
  it('перемикачі з таблиці: невідомі ключі пропускаються', () => {
    expect(
      ruleSwitches([
        { key: 'barcode', enabled: false },
        { key: 'stare-pravylo', enabled: false },
      ]),
    ).toEqual({ barcode: false });
  });

  it('один рядок на кожне правило рішення', () => {
    expect(
      hitsOf('l1', {
        kind: 'review',
        candidates: [],
        rules: ['variations', 'rangeOffers'],
      }),
    ).toEqual([
      { rule: 'variations', listingId: 'l1', decision: 'review' },
      { rule: 'rangeOffers', listingId: 'l1', decision: 'review' },
    ]);
    expect(hitsOf('l2', { kind: 'product' })).toEqual([]);
  });
});

describe('RulesService', () => {
  const groupBy = jest.fn();
  const prisma = {
    matchingRule: {
      findMany: jest.fn(async () => [
        { key: 'barcode', enabled: false, updatedAt: new Date('2026-11-01') },
      ]),
      upsert: jest.fn(),
    },
    matchRun: {
      findFirst: jest.fn(async () => ({
        startedAt: new Date('2026-11-01T10:00:00Z'),
      })),
    },
    matchRuleHit: { groupBy },
  };
  const service = new RulesService(prisma as unknown as PrismaService);

  it('усі правила з перемикачем і лічильниками; без рядка — увімкнене', async () => {
    groupBy
      .mockResolvedValueOnce([
        { rule: 'variations', decision: 'review', _count: { _all: 3 } },
        { rule: 'variations', decision: 'product', _count: { _all: 5 } },
      ])
      .mockResolvedValueOnce([{ rule: 'variations', _count: { _all: 2 } }]);
    const { items, days } = await service.list();
    expect(days).toBe(30);
    expect(items).toHaveLength(MATCH_RULES.length);
    expect(items.find((r) => r.key === 'barcode')).toMatchObject({
      enabled: false,
      hits: 0,
    });
    expect(items.find((r) => r.key === 'variations')).toMatchObject({
      enabled: true,
      updatedAt: null,
      hits: 8,
      lastBatch: 2,
      byDecision: [
        { decision: 'product', count: 5 },
        { decision: 'review', count: 3 },
      ],
    });
  });

  it('невідоме правило — 404', async () => {
    await expect(service.set('nope', false)).rejects.toThrow(NotFoundException);
    await service.set('choice', false);
    expect(prisma.matchingRule.upsert).toHaveBeenCalledWith({
      where: { key: 'choice' },
      create: { key: 'choice', enabled: false },
      update: { enabled: false },
    });
  });
});

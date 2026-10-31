import type { MatchDecision, RuleSwitches } from '@repo/matching';
import { isMatchRule } from '@repo/matching';

/** Скільки днів зберігаються спрацювання правил (match_rule_hits) */
export const RULE_HITS_DAYS = 30;

export function ruleHitsCutoff(now: Date): Date {
  return new Date(now.getTime() - RULE_HITS_DAYS * 24 * 60 * 60 * 1000);
}

/** Перемикачі з таблиці matching_rules; невідомі ключі (перейменоване правило) пропускаються */
export function ruleSwitches(
  rows: { key: string; enabled: boolean }[],
): RuleSwitches {
  const switches: RuleSwitches = {};
  for (const row of rows) {
    if (isMatchRule(row.key)) switches[row.key] = row.enabled;
  }
  return switches;
}

/** Рядки match_rule_hits для одного рішення */
export function hitsOf(listingId: string, decision: MatchDecision) {
  return (decision.rules ?? []).map((rule) => ({
    rule,
    listingId,
    decision: decision.kind,
  }));
}

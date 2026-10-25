/** Порядок видачі після оцінки: жорсткі правила, різноманіття і слоти дослідження (AUDIT §9.3) */
import type { Profile } from './profile';
import { scoreAll, WEIGHTS, type Candidate } from './score';

/** "Для вас": не більше двох товарів однієї лінійки */
export const MAX_PER_LINE = 2;
/** Штраф за кожен уже взятий товар тієї самої категорії — щоб видача не була з однієї полиці */
export const CATEGORY_PENALTY = 0.15;
/** Частка випадкових слотів: вони збирають незміщені дані для навчання v1 */
export const EXPLORE_SHARE = 0.1;

/** Пошук: за оцінкою, рівні лишаються в порядку базового пошуку */
export function rankSearch(
  candidates: Candidate[],
  profile: Profile,
): string[] {
  const scores = scoreAll(candidates, profile, WEIGHTS.search);
  return candidates
    .map((c, i) => ({ id: c.id, i, s: scores.get(c.id)! }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((c) => c.id);
}

/**
 * "Для вас": лише товари країни користувача, без того, за чим він уже стежить; жадібно найкращий
 * з урахуванням штрафу категорії й межі лінійки, а ⌊limit·10 %⌋ слотів — випадковий товар
 * на випадковій позиції (`explored` — щоб записати їх окремим списком).
 */
export function rankForYou(
  candidates: Candidate[],
  profile: Profile,
  options: { limit: number; exclude?: Set<string>; random?: () => number },
): { ids: string[]; explored: Set<string> } {
  const { limit, exclude = new Set<string>(), random = Math.random } = options;
  const unique = [...new Map(candidates.map((c) => [c.id, c])).values()];
  let pool = unique.filter((c) => c.inCountry && !exclude.has(c.id));
  const scores = scoreAll(pool, profile, WEIGHTS.forYou);
  const lines = new Map<string, number>();
  const categories = new Map<string, number>();
  const fits = (c: Candidate) =>
    !c.line || (lines.get(c.line) ?? 0) < MAX_PER_LINE;
  const take = (c: Candidate) => {
    if (c.line) lines.set(c.line, (lines.get(c.line) ?? 0) + 1);
    const category = c.category ?? '';
    categories.set(category, (categories.get(category) ?? 0) + 1);
    pool = pool.filter((p) => p !== c);
  };

  const exploreSlots = Math.floor(limit * EXPLORE_SHARE);
  const ids: string[] = [];
  while (ids.length < limit - exploreSlots) {
    let best: Candidate | null = null;
    let bestScore = -Infinity;
    for (const c of pool) {
      if (!fits(c)) continue;
      const s =
        scores.get(c.id)! -
        CATEGORY_PENALTY * (categories.get(c.category ?? '') ?? 0);
      if (s > bestScore) [best, bestScore] = [c, s];
    }
    if (!best) break;
    take(best);
    ids.push(best.id);
  }

  const explored = new Set<string>();
  for (let i = 0; i < exploreSlots; i++) {
    const rest = pool.filter(fits);
    if (!rest.length) break;
    const pick = rest[Math.floor(random() * rest.length)];
    take(pick);
    explored.add(pick.id);
    ids.splice(Math.floor(random() * (ids.length + 1)), 0, pick.id);
  }
  return { ids, explored };
}

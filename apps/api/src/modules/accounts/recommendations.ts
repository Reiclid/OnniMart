/** "For you" без БД: які категорії взяти й як перемішати кандидатів — щоб перевірити тестами */

/** Категорії підписок за частотою (найбільше підписок — першою), без порожніх */
export function topCategories(slugs: (string | null)[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const slug of slugs)
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([slug]) => slug);
}

/**
 * По черзі з кожної категорії (а не всі з першої), без того, за чим користувач уже стежить,
 * і без повторів між категоріями.
 */
export function interleave<T extends { id: string }>(
  lists: T[][],
  exclude: Set<string>,
  limit: number,
): T[] {
  const seen = new Set(exclude);
  const out: T[] = [];
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const item = list[i];
      if (item && !seen.has(item.id) && out.length < limit) {
        seen.add(item.id);
        out.push(item);
      }
    }
  }
  return out;
}

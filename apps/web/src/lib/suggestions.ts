/**
 * Підказки пошуку (Figma: Search — typing, suggestions): з перших знайдених товарів
 * складаємо доповнення запиту ("mil" → "milk", "milk chocolate"), найчастішу категорію
 * й до трьох товарів. Без окремого індексу — лише з видачі каталогу.
 */
export interface SuggestionSource {
  name: string;
  category: string | null;
}

const MAX_QUERIES = 3;
const WORD = /[\p{L}\p{N}%.,-]+/gu;

/** Доповнення запиту словом, на якому зупинився покупець, і наступним словом */
export function querySuggestions(query: string, names: string[]): string[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (q.length < 2) return [];
  const counts = new Map<string, number>();
  for (const name of names) {
    const words = name.toLowerCase().match(WORD) ?? [];
    const typed = q.split(' ');
    // Кожне доповнення — раз на товар, навіть якщо слово трапляється в назві двічі
    const seen = new Set<string>();
    for (let i = 0; i + typed.length <= words.length; i++) {
      // Повні слова запиту збігаються, останнє — лише початком
      const fits = typed.every((part, k) => (k === typed.length - 1 ? words[i + k].startsWith(part) : words[i + k] === part));
      if (!fits) continue;
      const phrase = words.slice(i, i + typed.length).join(' ');
      const next = words[i + typed.length];
      const candidates = [phrase, next && /^\p{L}{3,}$/u.test(next) ? `${phrase} ${next}` : null];
      for (const c of candidates) if (c && c !== q) seen.add(c);
    }
    for (const c of seen) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))
    .slice(0, MAX_QUERIES)
    .map(([c]) => c);
}

/** Категорія, до якої належать щонайменше два з перших десяти товарів (найчастіша) */
export function topCategory(items: SuggestionSource[]): string | null {
  const counts = new Map<string, number>();
  for (const { category } of items.slice(0, 10)) if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return best && best[1] >= 2 ? best[0] : null;
}

/** Недавні запити (localStorage): новий — першим, без повторів, не більше `limit` */
export function rememberQuery(recent: string[], query: string, limit = 5): string[] {
  const q = query.trim();
  if (!q) return recent;
  return [q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, limit);
}

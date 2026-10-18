import type { NameFeatures } from './features';

/** Вага слова — IDF: рідкісні слова ("слива", "Карпатський") важать більше за часті ("молоко") */
export type Idf = (token: string) => number;

/** Ознаки, відсутність яких з одного боку теж означає інший товар: Coca-Cola ≠ Coca-Cola Zero */
const STRICT_GROUPS = new Set(['sugar', 'caffeine', 'lactose', 'organic']);

/** Будує IDF за назвами (кожна назва — набір слів): log((N + 1) / (df + 1)) + 1 */
export function buildIdf(documents: Iterable<string[]>): Idf {
  const df = new Map<string, number>();
  let total = 0;
  for (const words of documents) {
    total++;
    for (const word of new Set(words)) df.set(word, (df.get(word) ?? 0) + 1);
  }
  return (token) => Math.log((total + 1) / ((df.get(token) ?? 0) + 1)) + 1;
}

function bigrams(word: string): string[] {
  const grams: string[] = [];
  for (let i = 0; i < word.length - 1; i++) grams.push(word.slice(i, i + 2));
  return grams;
}

/** Коефіцієнт Дайса за біграмами символів */
function dice(a: string, b: string): number {
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.length === 0 || gb.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of ga) counts.set(g, (counts.get(g) ?? 0) + 1);
  let common = 0;
  for (const g of gb) {
    const left = counts.get(g) ?? 0;
    if (left > 0) {
      common++;
      counts.set(g, left - 1);
    }
  }
  return (2 * common) / (ga.length + gb.length);
}

/**
 * Схожість двох слів 0..1. Різні закінчення ("мінеральна" / "мінеральний",
 * "Яготинське" / "Яготинський") — 0,9; описки — коефіцієнт Дайса від 0,8.
 * Числа мають збігатися точно.
 */
export function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (/\d/.test(a) || /\d/.test(b)) return 0;
  const shorter = Math.min(a.length, b.length);
  let prefix = 0;
  while (prefix < shorter && a[prefix] === b[prefix]) prefix++;
  if (prefix >= 4 && prefix >= Math.max(a.length, b.length) - 3) return 0.9;
  const score = dice(a, b);
  return score >= 0.8 ? score : 0;
}

/**
 * Схожість назв: зважений коефіцієнт Жаккара з нечітким порівнянням слів,
 * усереднений з коефіцієнтом включення (одна назва — частина іншої:
 * "паста сиркова банан" ⊂ "паста сиркова банан з 6 місяців").
 */
export function nameSimilarity(a: string[], b: string[], idf: Idf): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const wa = a.map(idf);
  const wb = b.map(idf);
  const used = new Array<boolean>(b.length).fill(false);
  // Жадібне зіставлення слів один-до-одного, починаючи з найважчих
  const order = a.map((_, i) => i).sort((x, y) => wa[y] - wa[x]);
  let matched = 0;
  for (const i of order) {
    let best = 0;
    let bestJ = -1;
    for (let j = 0; j < b.length; j++) {
      if (used[j]) continue;
      const score = tokenSimilarity(a[i], b[j]);
      if (score > best) {
        best = score;
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      used[bestJ] = true;
      matched += (best * (wa[i] + wb[bestJ])) / 2;
    }
  }

  const totalA = wa.reduce((s, w) => s + w, 0);
  const totalB = wb.reduce((s, w) => s + w, 0);
  const jaccard = matched / (totalA + totalB - matched);
  const containment = matched / Math.min(totalA, totalB);
  return (jaccard + containment) / 2;
}

/**
 * Збіг брендів: той самий — 1; суббренд ("яготинське" і "яготинське для дітей") — 0,8;
 * різні — 0 (точно інший товар). Бренд відомий лише з одного боку — 0,85: такі пари
 * ніколи не зіставляються автоматично, лише через модерацію. Інакше "Котлета Домашня"
 * власної кухні NOVUS збігалася з однойменною котлетою МегаМаркету без бренду.
 */
export function brandSimilarity(a: string | null, b: string | null): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0.85;
  if (a === b || a.replace(/-/g, '') === b.replace(/-/g, '')) return 1;
  if (a.startsWith(`${b}-`) || b.startsWith(`${a}-`)) return 0.8;
  return 0;
}

/** Група ознак, за якою товари точно різні, або null */
export function attributeConflict(
  a: Record<string, string>,
  b: Record<string, string>,
): string | null {
  for (const group of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const left = a[group];
    const right = b[group];
    if (left && right && left !== right) return group;
    if (
      (left === undefined) !== (right === undefined) &&
      STRICT_GROUPS.has(group)
    ) {
      return group;
    }
  }
  return null;
}

export interface PairScore {
  /** Підсумкова схожість 0..1 */
  score: number;
  name: number;
  brand: number;
  /** Чому пара відкинута: група ознак або "brand" */
  conflict?: string;
}

export function scorePair(
  a: NameFeatures,
  b: NameFeatures,
  idf: Idf,
): PairScore {
  const conflict = attributeConflict(a.attributes, b.attributes);
  if (conflict) return { score: 0, name: 0, brand: 0, conflict };
  const brand = brandSimilarity(a.brand, b.brand);
  if (brand === 0) return { score: 0, name: 0, brand: 0, conflict: 'brand' };
  // Ні бренду, ні значущих слів ("Пакет 0,5 л") — порівнювати нічого
  if (!a.brand && !b.brand && !a.tokens.length && !b.tokens.length) {
    return { score: 0, name: 0, brand, conflict: 'empty' };
  }
  const name = nameSimilarity(
    a.tokens.map((t) => t.norm),
    b.tokens.map((t) => t.norm),
    idf,
  );
  // Жирність / міцність вказана лише з одного боку — трохи менше впевненості
  const percentPenalty =
    (a.attributes.percent === undefined) !==
    (b.attributes.percent === undefined)
      ? 0.9
      : 1;
  return {
    score: round(name * brand * percentPenalty),
    name: round(name),
    brand,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

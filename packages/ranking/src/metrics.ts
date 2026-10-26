/** Офлайн-метрики ранжування (AUDIT §9.3): NDCG@k, MRR, AUC */

/** DCG@k за оцінками релевантності в показаному порядку: Σ (2^rel − 1) / log2(i + 2) */
function dcg(gains: number[], k: number): number {
  return gains
    .slice(0, k)
    .reduce((sum, g, i) => sum + (2 ** g - 1) / Math.log2(i + 2), 0);
}

/** NDCG@k: DCG порядку моделі / DCG ідеального порядку; без жодної релевантності — 0 */
export function ndcgAt(
  order: string[],
  relevance: Map<string, number>,
  k: number,
): number {
  const ideal = dcg(
    [...relevance.values()].sort((a, b) => b - a),
    k,
  );
  return ideal > 0
    ? dcg(
        order.map((id) => relevance.get(id) ?? 0),
        k,
      ) / ideal
    : 0;
}

/** Обернений ранг першого кліку (1 — перша позиція); без кліку — 0 */
export function reciprocalRank(order: string[], clicked: Set<string>): number {
  const i = order.findIndex((id) => clicked.has(id));
  return i < 0 ? 0 : 1 / (i + 1);
}

/** AUC: імовірність, що випадковий позитив оцінено вище за випадковий негатив (рівні — ½) */
export function auc(scores: number[], labels: boolean[]): number {
  const ranked = scores
    .map((s, i) => ({ s, y: labels[i] }))
    .sort((a, b) => a.s - b.s);
  let positives = 0;
  let rankSum = 0;
  // Середні ранги для рівних оцінок
  for (let i = 0; i < ranked.length;) {
    let j = i;
    while (j < ranked.length && ranked[j].s === ranked[i].s) j++;
    const rank = (i + 1 + j) / 2;
    for (let t = i; t < j; t++)
      if (ranked[t].y) {
        positives++;
        rankSum += rank;
      }
    i = j;
  }
  const negatives = ranked.length - positives;
  if (!positives || !negatives) return 0.5;
  return (
    (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives)
  );
}

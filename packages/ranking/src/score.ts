/**
 * Ранжувальник v0 (AUDIT §9.3): прозора лінійна оцінка score = Σ wᵢ·xᵢ з ручними вагами.
 * Працює без даних; v1/v2 мають його перевершити на тих самих ознаках.
 */
import { affinity, type Profile } from './profile';

/** Товар-кандидат з усім, що потрібно для ознак */
export interface Candidate {
  id: string;
  /** Порядок базового пошуку 0..1 (1 — перший); у "Для вас" 0 */
  relevance: number;
  category: string | null;
  concept: string | null;
  brand: string | null;
  line: string | null;
  chains: string[];
  /** Найглибша справжня знижка серед карток, 0..1 */
  discount: number;
  /** Найнижча ціна за базову одиницю (г, мл, шт) у кожній валюті */
  unitPrices: Record<string, number>;
  /** Є в мережах країни користувача (true, якщо країна невідома) */
  inCountry: boolean;
}

export const FEATURES = [
  'relevance',
  'popularity',
  'discount',
  'cheap',
  'category',
  'concept',
  'brand',
  'chain',
  'country',
] as const;

export type Feature = (typeof FEATURES)[number];
export type Features = Record<Feature, number>;
export type Weights = Record<Feature, number>;

/**
 * Пошук: релевантність головна, особисте лише розводить близькі позиції.
 * "Для вас": запиту немає, тож вирішують схильності, популярність і вигода.
 */
export const WEIGHTS = {
  search: {
    relevance: 1,
    popularity: 0.1,
    discount: 0.05,
    cheap: 0.05,
    category: 0.05,
    concept: 0.1,
    brand: 0.1,
    chain: 0.05,
    country: 0.5,
  },
  forYou: {
    relevance: 0,
    popularity: 0.3,
    discount: 0.2,
    cheap: 0.15,
    category: 0.3,
    concept: 0.4,
    brand: 0.3,
    chain: 0.2,
    country: 0,
  },
} satisfies Record<string, Weights>;

/**
 * Дешевизна −1..1: z-оцінка log ціни за одиницю серед кандидатів тієї самої категорії й валюти
 * (зі знаком мінус — дешевше вище), середнє по валютах. Групи з одного товару дають 0.
 */
export function cheapness(candidates: Candidate[]): Map<string, number> {
  const groups = new Map<string, number[]>();
  const key = (c: Candidate, currency: string) =>
    `${c.category ?? ''}|${currency}`;
  for (const c of candidates)
    for (const [currency, price] of Object.entries(c.unitPrices))
      if (price > 0) {
        const k = key(c, currency);
        const logs = groups.get(k) ?? [];
        logs.push(Math.log(price));
        groups.set(k, logs);
      }
  const stats = new Map(
    [...groups].map(([k, logs]) => {
      const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
      const sd = Math.sqrt(
        logs.reduce((a, b) => a + (b - mean) ** 2, 0) / logs.length,
      );
      return [k, { mean, sd }];
    }),
  );
  const out = new Map<string, number>();
  for (const c of candidates) {
    const zs = Object.entries(c.unitPrices)
      .filter(([, price]) => price > 0)
      .map(([currency, price]) => {
        const { mean, sd } = stats.get(key(c, currency))!;
        return sd > 0 ? (mean - Math.log(price)) / sd : 0;
      });
    const z = zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : 0;
    out.set(c.id, Math.max(-1, Math.min(1, z / 2)));
  }
  return out;
}

export function featuresOf(
  c: Candidate,
  profile: Profile,
  context: { maxChains: number; cheap: Map<string, number> },
): Features {
  return {
    relevance: c.relevance,
    popularity:
      context.maxChains > 0
        ? Math.log1p(c.chains.length) / Math.log1p(context.maxChains)
        : 0,
    discount: c.discount,
    cheap: context.cheap.get(c.id) ?? 0,
    category: affinity(profile.category, c.category),
    concept: affinity(profile.concept, c.concept),
    brand: affinity(profile.brand, c.brand),
    chain: Math.max(
      0,
      ...c.chains.map((chain) => affinity(profile.chain, chain)),
    ),
    country: c.inCountry ? 1 : 0,
  };
}

/** Оцінка і внесок кожної ознаки — з внеску видно, чому товар тут ("бо ви стежите за молоком") */
export function score(
  features: Features,
  weights: Weights,
): { score: number; contributions: Features } {
  const contributions = Object.fromEntries(
    FEATURES.map((f) => [f, weights[f] * features[f]]),
  ) as Features;
  return {
    score: FEATURES.reduce((sum, f) => sum + contributions[f], 0),
    contributions,
  };
}

/** Оцінки всіх кандидатів набору (ознаки дешевизни й популярності — відносно цього набору) */
export function scoreAll(
  candidates: Candidate[],
  profile: Profile,
  weights: Weights,
): Map<string, number> {
  const context = {
    maxChains: Math.max(0, ...candidates.map((c) => c.chains.length)),
    cheap: cheapness(candidates),
  };
  return new Map(
    candidates.map((c) => [
      c.id,
      score(featuresOf(c, profile, context), weights).score,
    ]),
  );
}

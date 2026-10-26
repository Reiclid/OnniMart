import { auc, ndcgAt, reciprocalRank } from './metrics';
import { emptyModel, ipwExamples, logit, trainLogistic } from './model';
import { FEATURES, type Candidate, type Features } from './score';
import {
  evaluate,
  examination,
  seeded,
  simulate,
  v0Scores,
  type Session,
} from './simulate';

describe('метрики', () => {
  it('NDCG@k: ідеальний порядок — 1, обернений — менше, без релевантних — 0', () => {
    const rel = new Map([
      ['a', 1],
      ['b', 0.5],
      ['c', 0],
    ]);
    expect(ndcgAt(['a', 'b', 'c'], rel, 3)).toBeCloseTo(1);
    expect(ndcgAt(['c', 'b', 'a'], rel, 3)).toBeLessThan(0.7);
    expect(ndcgAt(['a'], new Map([['a', 0]]), 3)).toBe(0);
  });

  it('MRR: 1 / позиція першого кліку', () => {
    expect(reciprocalRank(['a', 'b', 'c'], new Set(['b', 'c']))).toBe(0.5);
    expect(reciprocalRank(['a'], new Set())).toBe(0);
  });

  it('AUC: ідеальне розділення — 1, обернене — 0, рівні оцінки — ½', () => {
    expect(auc([0.9, 0.8, 0.1], [true, true, false])).toBe(1);
    expect(auc([0.1, 0.9], [true, false])).toBe(0);
    expect(auc([0.5, 0.5], [true, false])).toBe(0.5);
  });
});

const features = (over: Partial<Features>): Features => ({
  ...(Object.fromEntries(FEATURES.map((f) => [f, 0])) as Features),
  ...over,
});

describe('v1: логістична регресія', () => {
  it('вчить знак ознаки, що справді впливає на клік, і ігнорує шум', () => {
    const random = seeded(1);
    const examples = Array.from({ length: 4000 }, () => {
      const cheap = random() * 2 - 1;
      const noise = random();
      return {
        features: features({ cheap, brand: noise }),
        clicked: random() < 1 / (1 + Math.exp(-3 * cheap)),
        weight: 1,
      };
    });
    const model = trainLogistic(examples, { random: seeded(2) });
    expect(model.weights.cheap).toBeGreaterThan(1.5);
    expect(Math.abs(model.weights.brand)).toBeLessThan(0.5);
  });

  it('IPW: клік на нижчій позиції важить більше; без зсуву користувача — глобальна модель', () => {
    const [top, low] = ipwExamples(
      [
        { features: features({}), position: 0, clicked: true },
        { features: features({}), position: 9, clicked: true },
      ],
      examination,
    );
    expect(top.weight).toBe(1);
    expect(low.weight).toBeCloseTo(Math.log2(11));
    const model = { ...emptyModel(), bias: 0.3 };
    expect(logit(model, features({}), 'хтось')).toBe(0.3);
  });
});

/** Синтетичний каталог: 6 категорій × 40 товарів, бренди, ціни, акції */
function catalogue(): Candidate[] {
  const random = seeded(7);
  return Array.from({ length: 240 }, (_, i) => ({
    id: `p${i}`,
    relevance: 0,
    category: `cat${i % 6}`,
    concept: null,
    brand: `brand${i % 15}`,
    line: null,
    chains: Array.from({ length: 1 + (i % 4) }, (_, k) => `chain${k}`),
    discount: random() < 0.2 ? random() * 0.4 : 0,
    unitPrices: { UAH: 0.02 + random() * 0.08 },
    inCountry: true,
  }));
}

describe('симулятор і rec:evaluate', () => {
  const sim = simulate({
    catalogues: new Map([['UA', catalogue()]]),
    usersPerPersona: 8,
    trainSessions: 40,
    testSessions: 10,
    seed: 3,
    personas: [
      {
        name: 'olena',
        country: 'UA',
        cheap: 1.5,
        promo: 1,
        brandLoyalty: 0.4,
        categories: 2,
      },
    ],
  });

  it('детермінований за seed', () => {
    const again = simulate({
      catalogues: new Map([['UA', catalogue()]]),
      usersPerPersona: 8,
      trainSessions: 40,
      testSessions: 10,
      seed: 3,
      personas: sim.users.slice(0, 1).map((u) => u.persona),
    });
    expect(again.train.filter((i) => i.clicked).length).toBe(
      sim.train.filter((i) => i.clicked).length,
    );
  });

  it('v0 краще за випадковий порядок, навчена v1 — не гірша за v0', () => {
    const random = seeded(9);
    const randomScores = (s: Session) =>
      new Map(s.candidates.map((c) => [c.id, random()]));
    const model = trainLogistic(ipwExamples(sim.train, examination), {
      random: seeded(4),
    });
    const v1 = (s: Session) =>
      new Map(
        [...s.features].map(([id, f]) => [id, logit(model, f, s.user.id)]),
      );
    const base = evaluate(sim.test, randomScores);
    const v0 = evaluate(sim.test, v0Scores);
    const learned = evaluate(sim.test, v1);
    expect(v0.ndcg10).toBeGreaterThan(base.ndcg10);
    expect(learned.ndcg10).toBeGreaterThanOrEqual(v0.ndcg10);
    expect(learned.auc).toBeGreaterThan(0.6);
  });
});

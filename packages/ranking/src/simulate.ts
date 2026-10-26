/**
 * Симулятор користувачів (AUDIT §9.3, пункт 4): справжнього трафіку мало, тож моделі порівнюються
 * на синтетичних користувачах з персон docs/05-user-research.md поверх справжнього каталогу.
 *
 * Кожен користувач має приховану корисність товару (улюблені категорії й бренди, чутливість до
 * ціни й акцій, країна). P(клік | побачив) = σ(корисність); позицію p переглядають з імовірністю
 * 1 / log2(p + 2) — як і в реальних списках, нижче клікають рідше незалежно від товару.
 * Логи збирає v0 з 10 % випадкових слотів; моделі вчаться на них і порівнюються на окремих сесіях.
 */
import { auc, ndcgAt, reciprocalRank } from './metrics';
import { buildProfile, type Profile, type Signal } from './profile';
import { EXPLORE_SHARE } from './rerank';
import {
  cheapness,
  featuresAll,
  score,
  WEIGHTS,
  type Candidate,
  type Features,
} from './score';

/** Детермінований генератор (mulberry32): однаковий seed — однакові користувачі й сесії */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Імовірність, що позицію p (з 0) взагалі переглянули */
export const examination = (position: number) => 1 / Math.log2(position + 2);

export interface Persona {
  name: string;
  country: string;
  /** Вага дешевизни за одиницю в корисності */
  cheap: number;
  /** Вага знижки */
  promo: number;
  /** Вага улюбленого бренду */
  brandLoyalty: number;
  /** Скільки улюблених категорій */
  categories: number;
}

/** Персони docs/05-user-research.md (+ покупець у Німеччині для другої країни) */
export const PERSONAS: Persona[] = [
  // Олена: великий тижневий кошик, рахує гроші, перевіряє, чи знижка справжня
  {
    name: 'olena',
    country: 'UA',
    cheap: 1.5,
    promo: 1,
    brandLoyalty: 0.4,
    categories: 5,
  },
  // Макс: малий кошик дорогою, порівнює ціну за літр / кг
  {
    name: 'max',
    country: 'UA',
    cheap: 1.2,
    promo: 0.3,
    brandLoyalty: 0.2,
    categories: 3,
  },
  // Ірина: ті самі 15–20 товарів, купує на справжній знижці
  {
    name: 'iryna',
    country: 'UA',
    cheap: 0.4,
    promo: 2,
    brandLoyalty: 1.5,
    categories: 2,
  },
  {
    name: 'berlin',
    country: 'DE',
    cheap: 1,
    promo: 0.6,
    brandLoyalty: 0.6,
    categories: 3,
  },
];

export interface SimUser {
  id: string;
  persona: Persona;
  /** Улюблені категорії з вагою 0.5..1 */
  categories: Map<string, number>;
  brands: Set<string>;
  profile: Profile;
}

export type ListType = 'search' | 'for-you';

export interface Session {
  user: SimUser;
  list: ListType;
  candidates: Candidate[];
  features: Map<string, Features>;
  /** Справжня P(клік | побачив) — оцінка релевантності для NDCG */
  truth: Map<string, number>;
  /** Спільні випадкові числа: обидві моделі бачать ті самі «кидки кубика» */
  uExamine: number[];
  uClick: Map<string, number>;
}

/** Показ у зібраних логах */
export interface Impression {
  userId: string;
  list: ListType;
  features: Features;
  position: number;
  clicked: boolean;
}

export const SHOWN = 10;
const FOR_YOU_POOL = 60;
const SEARCH_POOL = 40;
const HISTORY = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function sample<T>(items: T[], n: number, random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** Прихована корисність: те, що модель має відгадати з ознак і поведінки */
function utility(user: SimUser, c: Candidate, cheap: number): number {
  const p = user.persona;
  return (
    -3 +
    2.5 * (user.categories.get(c.category ?? '') ?? 0) +
    1.5 * p.brandLoyalty * (c.brand && user.brands.has(c.brand) ? 1 : 0) +
    p.cheap * cheap +
    3 * p.promo * c.discount +
    // Пошук: текстова відповідність запиту теж важить
    1.5 * c.relevance +
    (c.inCountry ? 0 : -4)
  );
}

function truthOf(user: SimUser, candidates: Candidate[]): Map<string, number> {
  const cheap = cheapness(candidates);
  return new Map(
    candidates.map((c) => [
      c.id,
      sigmoid(utility(user, c, cheap.get(c.id) ?? 0)),
    ]),
  );
}

function makeUser(
  id: string,
  persona: Persona,
  catalogue: Candidate[],
  now: Date,
  random: () => number,
): SimUser {
  const categories = [
    ...new Set(catalogue.map((c) => c.category).filter((c) => c !== null)),
  ];
  const liked = new Map(
    sample(categories, persona.categories, random).map((c) => [
      c,
      0.5 + random() / 2,
    ]),
  );
  const brands = new Set(
    sample(
      catalogue
        .filter((c) => c.brand && liked.has(c.category ?? ''))
        .map((c) => c.brand!),
      3,
      random,
    ),
  );
  const user: SimUser = {
    id,
    persona,
    categories: liked,
    brands,
    profile: buildProfile([], now),
  };
  // Історія до симуляції: перегляди (і частина обраного / підписок) товарів, які йому подобаються
  const pool = sample(catalogue, HISTORY * 8, random);
  const truth = truthOf(user, pool);
  const signals: Signal[] = pool
    .filter((c) => random() < truth.get(c.id)!)
    .slice(0, HISTORY)
    .map((c) => {
      const r = random();
      return {
        type: r < 0.1 ? 'track' : r < 0.25 ? 'favourite' : 'view',
        at: new Date(now.getTime() - random() * 60 * DAY_MS),
        category: c.category,
        concept: c.concept,
        brand: c.brand,
        chains: c.chains,
      };
    });
  user.profile = buildProfile(signals, now);
  return user;
}

function makeSession(
  user: SimUser,
  catalogue: Candidate[],
  random: () => number,
): Session {
  const list: ListType = random() < 0.5 ? 'search' : 'for-you';
  let candidates: Candidate[];
  if (list === 'search') {
    // Запит про одну з улюблених категорій (або випадкову); базовий порядок не персональний
    const liked = [...user.categories.keys()];
    const category =
      random() < 0.7 && liked.length
        ? liked[Math.floor(random() * liked.length)]
        : catalogue[Math.floor(random() * catalogue.length)].category;
    const pool = sample(
      catalogue.filter((c) => c.category === category),
      SEARCH_POOL,
      random,
    );
    candidates = pool.map((c, i) => ({
      ...c,
      relevance: 1 - i / pool.length,
    }));
  } else {
    // Як і в API: популярне з улюблених категорій профілю + просто популярне
    const liked = catalogue.filter((c) =>
      user.categories.has(c.category ?? ''),
    );
    candidates = [
      ...new Map(
        [
          ...sample(liked, FOR_YOU_POOL / 2, random),
          ...sample(catalogue, FOR_YOU_POOL / 2, random),
        ].map((c) => [c.id, { ...c, relevance: 0 }]),
      ).values(),
    ];
  }
  return {
    user,
    list,
    candidates,
    features: featuresAll(candidates, user.profile),
    truth: truthOf(user, candidates),
    uExamine: Array.from({ length: SHOWN }, random),
    uClick: new Map(candidates.map((c) => [c.id, random()])),
  };
}

/** Порядок за оцінками; рівні — у порядку кандидатів */
export function orderBy(
  session: Session,
  scores: Map<string, number>,
): string[] {
  return session.candidates
    .map((c, i) => ({ id: c.id, i, s: scores.get(c.id) ?? 0 }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((c) => c.id);
}

/** Що клікнув користувач у показаному порядку (перші SHOWN) */
export function clicksOf(session: Session, order: string[]): Set<string> {
  return new Set(
    order
      .slice(0, SHOWN)
      .filter(
        (id, p) =>
          session.uExamine[p] < examination(p) &&
          session.uClick.get(id)! < session.truth.get(id)!,
      ),
  );
}

/** Оцінки v0 — політика, що збирала логи */
export function v0Scores(session: Session): Map<string, number> {
  const weights = session.list === 'search' ? WEIGHTS.search : WEIGHTS.forYou;
  return new Map(
    [...session.features].map(([id, f]) => [id, score(f, weights).score]),
  );
}

/** Логи: v0 з ⌊SHOWN · 10 %⌋ випадковими слотами (як «Для вас» у проді) */
function logSession(session: Session, random: () => number): Impression[] {
  const order = orderBy(session, v0Scores(session)).slice(0, SHOWN);
  const rest = session.candidates
    .map((c) => c.id)
    .filter((id) => !order.includes(id));
  for (let i = 0; i < Math.floor(SHOWN * EXPLORE_SHARE) && rest.length; i++) {
    const [pick] = rest.splice(Math.floor(random() * rest.length), 1);
    order[Math.floor(random() * order.length)] = pick;
  }
  const clicked = clicksOf(session, order);
  return order.map((id, position) => ({
    userId: session.user.id,
    list: session.list,
    features: session.features.get(id)!,
    position,
    clicked: clicked.has(id),
  }));
}

export interface Simulation {
  users: SimUser[];
  /** Покази для навчання */
  train: Impression[];
  /** Окремі сесії тих самих користувачів для порівняння моделей */
  test: Session[];
}

export function simulate(options: {
  /** Каталог кожної країни (inCountry — відносно неї) */
  catalogues: Map<string, Candidate[]>;
  usersPerPersona: number;
  trainSessions: number;
  testSessions: number;
  seed?: number;
  now?: Date;
  personas?: Persona[];
}): Simulation {
  const random = seeded(options.seed ?? 42);
  const now = options.now ?? new Date();
  const users: SimUser[] = [];
  const train: Impression[] = [];
  const test: Session[] = [];
  for (const persona of options.personas ?? PERSONAS) {
    const catalogue = options.catalogues.get(persona.country);
    if (!catalogue?.length) continue;
    for (let u = 0; u < options.usersPerPersona; u++) {
      const user = makeUser(
        `${persona.name}-${u}`,
        persona,
        catalogue,
        now,
        random,
      );
      users.push(user);
      for (let s = 0; s < options.trainSessions; s++)
        train.push(...logSession(makeSession(user, catalogue, random), random));
      for (let s = 0; s < options.testSessions; s++)
        test.push(makeSession(user, catalogue, random));
    }
  }
  return { users, train, test };
}

export interface Report {
  ndcg10: number;
  mrr: number;
  auc: number;
  /** Кліків на сесію в перших SHOWN (CTR@10 · SHOWN) */
  clicks: number;
}

/** Середні метрики моделі на тестових сесіях; AUC — оцінки проти «кидків» кліку всіх кандидатів */
export function evaluate(
  sessions: Session[],
  scorer: (session: Session) => Map<string, number>,
): Report {
  let ndcg = 0;
  let mrr = 0;
  let clicks = 0;
  const allScores: number[] = [];
  const labels: boolean[] = [];
  for (const session of sessions) {
    const scores = scorer(session);
    const order = orderBy(session, scores);
    ndcg += ndcgAt(order, session.truth, SHOWN);
    const clicked = clicksOf(session, order);
    mrr += reciprocalRank(order, clicked);
    clicks += clicked.size;
    for (const c of session.candidates) {
      allScores.push(scores.get(c.id) ?? 0);
      labels.push(session.uClick.get(c.id)! < session.truth.get(c.id)!);
    }
  }
  const n = sessions.length || 1;
  return {
    ndcg10: ndcg / n,
    mrr: mrr / n,
    auc: auc(allScores, labels),
    clicks: clicks / n,
  };
}

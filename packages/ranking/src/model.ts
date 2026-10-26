/**
 * Ранжувальник v1 (AUDIT §9.3): логістична регресія P(клік | показ) на тих самих ознаках, що й v0.
 * Глобальні ваги + малі персональні зсуви, сильніше стягнуті до нуля: у користувача з кількома
 * подіями фактично глобальна модель. Навчання — SGD з поправкою на позицію (IPW).
 */
import { FEATURES, type Features, type Weights } from './score';

export interface LinearModel {
  /** Версія формату (ваги зберігаються як JSON) */
  version: 1;
  bias: number;
  weights: Weights;
  /** Зсуви ваг окремих користувачів */
  users: Record<string, Partial<Weights>>;
}

export interface Example {
  features: Features;
  clicked: boolean;
  /** Вага прикладу: 1 / P(позицію переглянули) для кліків (IPW), 1 — для решти */
  weight: number;
  userId?: string;
}

export interface TrainOptions {
  epochs?: number;
  learningRate?: number;
  /** L2 глобальних ваг */
  l2?: number;
  /** L2 персональних зсувів — сильніша */
  userL2?: number;
  random?: () => number;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function emptyModel(): LinearModel {
  return {
    version: 1,
    bias: 0,
    weights: Object.fromEntries(FEATURES.map((f) => [f, 0])) as Weights,
    users: {},
  };
}

/** Логіт: score для порядку (монотонний з імовірністю) */
export function logit(
  model: LinearModel,
  features: Features,
  userId?: string,
): number {
  const own = userId ? model.users[userId] : undefined;
  return FEATURES.reduce(
    (z, f) => z + (model.weights[f] + (own?.[f] ?? 0)) * features[f],
    model.bias,
  );
}

export function predict(
  model: LinearModel,
  features: Features,
  userId?: string,
): number {
  return sigmoid(logit(model, features, userId));
}

/** SGD з перемішуванням; кроки згасають як lr / √епоха */
export function trainLogistic(
  examples: Example[],
  options: TrainOptions = {},
): LinearModel {
  const {
    epochs = 15,
    learningRate = 0.05,
    l2 = 1e-4,
    userL2 = 1e-2,
    random = Math.random,
  } = options;
  const model = emptyModel();
  const order = examples.map((_, i) => i);
  for (let epoch = 0; epoch < epochs; epoch++) {
    const lr = learningRate / Math.sqrt(epoch + 1);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const i of order) {
      const { features, clicked, weight, userId } = examples[i];
      const g = weight * (predict(model, features, userId) - (clicked ? 1 : 0));
      model.bias -= lr * g;
      const own = userId ? (model.users[userId] ??= {}) : undefined;
      for (const f of FEATURES) {
        const x = features[f];
        model.weights[f] -= lr * (g * x + l2 * model.weights[f]);
        if (own) own[f] = (own[f] ?? 0) - lr * (g * x + userL2 * (own[f] ?? 0));
      }
    }
  }
  return model;
}

/** Показ з логів: ознаки, позиція (з 0) і чи був клік */
export interface LoggedImpression {
  features: Features;
  position: number;
  clicked: boolean;
  userId?: string;
}

/**
 * Приклади для навчання з поправкою на позицію: клік на позиції p важить 1 / P(p переглянули)
 * (inverse propensity weighting), інакше модель вчить «бути першим», а не «подобатися»
 */
export function ipwExamples(
  impressions: LoggedImpression[],
  propensity: (position: number) => number,
): Example[] {
  return impressions.map(({ features, position, clicked, userId }) => ({
    features,
    clicked,
    weight: clicked ? 1 / propensity(position) : 1,
    userId,
  }));
}

/**
 * Профіль користувача (AUDIT §9.3): схильність до категорій, понять, брендів і мереж.
 * Кожна дія додає вагу, що згасає з часом: a ← a · e^(−Δt/τ) + w(подія).
 */

/** τ: за 30 днів вага дії зменшується в e разів */
export const TAU_DAYS = 30;

export const SIGNAL_WEIGHTS = {
  view: 1,
  click: 2,
  chain_click: 3,
  favourite: 5,
  track: 8,
} as const;

export type SignalType = keyof typeof SIGNAL_WEIGHTS;

/** Одна дія користувача з ознаками товару (або лише мережею для chain_click) */
export interface Signal {
  type: SignalType;
  at: Date;
  category?: string | null;
  concept?: string | null;
  brand?: string | null;
  chains?: string[];
}

export interface Profile {
  category: Map<string, number>;
  concept: Map<string, number>;
  brand: Map<string, number>;
  chain: Map<string, number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function emptyProfile(): Profile {
  return {
    category: new Map(),
    concept: new Map(),
    brand: new Map(),
    chain: new Map(),
  };
}

/** Сума згаслих ваг — те саме, що покрокове правило, але без збереженого стану */
export function buildProfile(
  signals: Signal[],
  now: Date,
  preferredChains: string[] = [],
): Profile {
  const profile = emptyProfile();
  const add = (
    map: Map<string, number>,
    key: string | null | undefined,
    w: number,
  ) => {
    if (key) map.set(key, (map.get(key) ?? 0) + w);
  };
  for (const s of signals) {
    const age = Math.max(now.getTime() - s.at.getTime(), 0) / DAY_MS;
    const w = SIGNAL_WEIGHTS[s.type] * Math.exp(-age / TAU_DAYS);
    add(profile.category, s.category, w);
    add(profile.concept, s.concept, w);
    add(profile.brand, s.brand, w);
    for (const chain of s.chains ?? []) add(profile.chain, chain, w);
  }
  // Мережі з налаштувань — явний вибір, не згасають
  for (const chain of preferredChains)
    add(profile.chain, chain, SIGNAL_WEIGHTS.track);
  return profile;
}

/** Схильність 0..1 відносно найсильнішої в цьому вимірі */
export function affinity(
  map: Map<string, number>,
  key: string | null | undefined,
): number {
  if (!key) return 0;
  const max = Math.max(0, ...map.values());
  return max > 0 ? (map.get(key) ?? 0) / max : 0;
}

/** Ключі за спаданням схильності */
export function topKeys(map: Map<string, number>, limit: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

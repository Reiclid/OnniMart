/**
 * Правила зіставлення, які модератор може вимкнути (/admin/rules). Вимкнене правило
 * не діє в CatalogIndex.decide, а рішення перелічує правила, що на нього вплинули.
 */
export const MATCH_RULES = [
  {
    key: 'barcode',
    title: 'Збіг штрихкоду',
    description:
      'Картка з відомим GTIN одразу стає тим самим фасуванням. Вимкнене — картку зіставляє лише назва.',
  },
  {
    key: 'attributes',
    title: 'Ознаки різновиду',
    description:
      'Різні ознаки (без цукру, без лактози, bio, жирність) — різні товари. Спрацьовує, коли відкидає кандидата.',
  },
  {
    key: 'choice',
    title: 'Слова вибору',
    description:
      '«oder», «verschiedene», «в асортименті»: пропозиція кількох товарів не зіставляється з одним конкретним.',
  },
  {
    key: 'variations',
    title: 'Вивчені варіації',
    description:
      'Різні вивчені варіації (смаки, сорти) з обох боків — різні товари; варіація з одного боку — схожість × 0,85 (PRD-30).',
  },
  {
    key: 'rangeOffers',
    title: 'Пропозиції на всю лінійку',
    description:
      'Назва без смаку не пропонується як той самий товар, коли в блоці ≥ 2 смаки цієї назви (працює лише з вивченими варіаціями).',
  },
  {
    key: 'barcodeMismatch',
    title: 'Різні штрихкоди — до модератора',
    description:
      'В обох є GTIN і жоден не збігся: висока схожість назви не зіставляє автоматично, а йде в чергу модерації.',
  },
  {
    key: 'crossCountry',
    title: 'Товар іншої країни',
    description:
      'Повний збіг бренду, назви й фасування з товаром іншої країни зіставляється («Coca-Cola 1,25 л» UA і DE).',
  },
  {
    key: 'newVariant',
    title: 'Нове фасування товару',
    description:
      'Той самий бренд і назва, але інше фасування — нове фасування наявного товару, а не новий товар.',
  },
] as const;

export type MatchRule = (typeof MATCH_RULES)[number]['key'];

/** Перемикачі правил: false — вимкнене, відсутнє — увімкнене */
export type RuleSwitches = Partial<Record<MatchRule, boolean>>;

export const isRuleOn = (rules: RuleSwitches | undefined, rule: MatchRule) =>
  rules?.[rule] !== false;

export function isMatchRule(key: string): key is MatchRule {
  return MATCH_RULES.some((r) => r.key === key);
}

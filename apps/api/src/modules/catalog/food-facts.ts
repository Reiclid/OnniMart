import { normalizeGtin } from '@repo/matching';

/**
 * Рядок CSV-вивантаження Open Food Facts (TSV, en.openfoodfacts.org.products.csv.gz) →
 * запис food_facts. Без I/O: імпорт — scripts/import-food-facts.ts.
 */

export interface FoodFactsRow {
  gtin: string;
  productName: string | null;
  brands: string[];
  quantity: string | null;
  imageUrl: string | null;
  ingredients: string | null;
  allergens: string[];
  labels: string[];
  categories: string[];
  analysis: string[];
  nutriments: Record<string, number> | null;
  nutriscore: string | null;
  nova: number | null;
  offModifiedAt: Date | null;
}

/** Стовпець OFF → ключ у nutriments (на 100 г) */
const NUTRIMENTS: Record<string, string> = {
  'energy-kcal_100g': 'energyKcal',
  fat_100g: 'fat',
  'saturated-fat_100g': 'saturatedFat',
  carbohydrates_100g: 'carbohydrates',
  sugars_100g: 'sugars',
  fiber_100g: 'fiber',
  proteins_100g: 'proteins',
  salt_100g: 'salt',
};

/** Номери потрібних стовпців за заголовком; без code — це не той файл */
export function columnIndex(header: string): Map<string, number> {
  const columns = new Map(
    header.split('\t').map((name, i) => [name.trim(), i]),
  );
  if (!columns.has('code')) throw new Error('У CSV немає стовпця code');
  return columns;
}

const tags = (value: string | undefined) =>
  value
    ? value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

/** "Milk, Gluten" / "en:milk,en:gluten" → ["milk", "gluten"] */
const allergensOf = (value: string | undefined) => [
  ...new Set(tags(value).map((t) => t.replace(/^[a-z]{2}:/, '').toLowerCase())),
];

export function parseOffRow(
  line: string,
  columns: Map<string, number>,
  wanted: Set<string>,
): FoodFactsRow | null {
  const cells = line.split('\t');
  const get = (name: string) => {
    const i = columns.get(name);
    const value = i === undefined ? undefined : cells[i]?.trim();
    return value ? value : undefined;
  };
  const gtin = normalizeGtin(get('code') ?? '');
  if (!gtin || !wanted.has(gtin)) return null;

  const nutriments: Record<string, number> = {};
  for (const [column, key] of Object.entries(NUTRIMENTS)) {
    const value = Number(get(column));
    if (get(column) !== undefined && Number.isFinite(value))
      nutriments[key] = value;
  }
  const grade = get('nutriscore_grade')?.toLowerCase();
  const nova = Number(get('nova_group'));
  const modified = Number(get('last_modified_t'));
  return {
    gtin,
    productName: get('product_name') ?? null,
    brands: tags(get('brands')),
    quantity: get('quantity') ?? null,
    imageUrl: get('image_small_url') ?? get('image_url') ?? null,
    ingredients: get('ingredients_text') ?? null,
    allergens: allergensOf(get('allergens_en') ?? get('allergens')),
    labels: tags(get('labels_tags')),
    categories: tags(get('categories_tags')),
    analysis: tags(get('ingredients_analysis_tags')),
    nutriments: Object.keys(nutriments).length ? nutriments : null,
    nutriscore: grade && /^[a-e]$/.test(grade) ? grade : null,
    nova: Number.isInteger(nova) && nova >= 1 && nova <= 4 ? nova : null,
    offModifiedAt: modified > 0 ? new Date(modified * 1000) : null,
  };
}

/** Відповідь API OFF v2 (/api/v2/product/<код>) → той самий запис, що й з CSV */
export function fromOffProduct(
  gtin: string,
  product: Record<string, unknown>,
): FoodFactsRow {
  const str = (key: string) =>
    typeof product[key] === 'string' && product[key]
      ? product[key].trim() || null
      : null;
  const list = (key: string) =>
    Array.isArray(product[key])
      ? (product[key] as unknown[]).filter(
          (t): t is string => typeof t === 'string',
        )
      : [];
  const n = (product.nutriments ?? {}) as Record<string, unknown>;
  const nutriments: Record<string, number> = {};
  for (const [column, key] of Object.entries(NUTRIMENTS)) {
    if (typeof n[column] === 'number') nutriments[key] = n[column];
  }
  const grade = str('nutriscore_grade')?.toLowerCase();
  const nova = Number(product.nova_group);
  const modified = Number(product.last_modified_t);
  return {
    gtin,
    productName: str('product_name'),
    brands: tags(str('brands') ?? undefined),
    quantity: str('quantity'),
    imageUrl: str('image_front_small_url') ?? str('image_small_url'),
    ingredients: str('ingredients_text'),
    allergens: allergensOf(list('allergens_tags').join(',')),
    labels: list('labels_tags'),
    categories: list('categories_tags'),
    analysis: list('ingredients_analysis_tags'),
    nutriments: Object.keys(nutriments).length ? nutriments : null,
    nutriscore: grade && /^[a-e]$/.test(grade) ? grade : null,
    nova: Number.isInteger(nova) && nova >= 1 && nova <= 4 ? nova : null,
    offModifiedAt: modified > 0 ? new Date(modified * 1000) : null,
  };
}

/** Код для OFF: як на етикетці (EAN-8 без шести нулів, EAN-13 без одного) */
export const offCode = (gtin14: string) =>
  gtin14.replace(/^0{6}(?=\d{8}$)/, '').replace(/^0(?=\d{13}$)/, '');

/**
 * Запити до каталогу, коли штрихкоду в нас немає: бренд + назва, кожен бренд окремо, назва.
 * Порожні й повтори — геть.
 */
export function suggestionQueries(
  facts: Pick<FoodFactsRow, 'productName' | 'brands'>,
): string[] {
  const name = facts.productName?.trim();
  const queries = [
    ...facts.brands.map((brand) => (name ? `${brand} ${name}` : brand)),
    ...facts.brands,
    ...(name ? [name] : []),
  ];
  return [
    ...new Set(
      queries.map((q) => q.replace(/\s*\([^)]*\)/g, '').trim()).filter(Boolean),
    ),
  ];
}

const words = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);

/**
 * Чи схожий товар каталогу на товар OFF: є назва — потрібне спільне слово (бренди в OFF
 * бувають помилкові: у води «Milbona»); назви немає — збіг бренду.
 */
export function isRelevantSuggestion(
  facts: Pick<FoodFactsRow, 'productName' | 'brands'>,
  item: { name: string; brand: string | null },
): boolean {
  if (facts.productName) {
    const name = new Set(words(facts.productName));
    return words(item.name).some((w) => name.has(w));
  }
  const brand = item.brand ? words(item.brand).join(' ') : null;
  return !!brand && facts.brands.some((b) => words(b).join(' ') === brand);
}

/**
 * Бренди OFF для підпису: спершу ті, що є серед брендів схожих товарів (у води ALDI бренди
 * «Milbona, Quellbrunn, …», а схожі за назвою — Quellbrunn), далі решта в порядку OFF.
 */
export function rankBrands(
  brands: string[],
  suggestions: { brand: string | null }[],
): string[] {
  const seen = new Set(
    suggestions.flatMap((s) => (s.brand ? [words(s.brand).join(' ')] : [])),
  );
  const known = brands.filter((b) => seen.has(words(b).join(' ')));
  return [...known, ...brands.filter((b) => !known.includes(b))];
}

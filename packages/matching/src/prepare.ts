import type { ListingInput } from './catalog-index';
import type { Measure } from './normalization/quantity';
import type { NameFeatures } from './features';
import { buildBrandDictionary, detectBrand, extractFeatures } from './features';

/** Картка мережі в тому вигляді, як її читає зіставлення з бази */
export interface ListingRow {
  id: string;
  chainId: string;
  country: string;
  rawName: string;
  rawBrand: string | null;
  barcodes: string[];
  measure: Measure | null;
  netQuantity: number | null;
  packCount: number | null;
  isWeighted: boolean;
}

export type BrandDictionaries = Map<string, { key: string; words: string[] }[]>;

/**
 * Обʼєднані модератором бренди (таблиця brand_aliases): ключ бренду-дубліката → ключ
 * основного ("sanpellegrino" → "san-pellegrino"). Різні ключі брендів — гарантовано різні
 * товари, тож без цього дублікати ніколи не зіставились би.
 */
export type BrandAliases = Map<string, string>;

/** Ключ бренду після злиття */
export function canonicalBrand(
  features: NameFeatures,
  aliases?: BrandAliases,
): NameFeatures {
  const target = features.brand && aliases?.get(features.brand);
  return target ? { ...features, brand: target } : features;
}

/**
 * Ознаки назви товару каталогу: слова бренду прибираються за його назвою, а ключ — це
 * збережений slug бренду. Перейменування бренду ("PREMIA" → "Премія") не змінює ключ,
 * інакше товари перестали б зіставлятися з картками.
 */
export function productFeatures(
  name: string,
  brand?: { name: string; slug: string } | null,
): NameFeatures {
  const features = extractFeatures(name, brand?.name);
  return brand ? { ...features, brand: brand.slug } : features;
}

/** Словник брендів кожної країни — за rawBrand усіх карток цієї країни */
export function buildDictionaries(
  rows: Pick<ListingRow, 'country' | 'rawBrand'>[],
): BrandDictionaries {
  const brandsByCountry = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.rawBrand) continue;
    const list = brandsByCountry.get(row.country) ?? [];
    list.push(row.rawBrand);
    brandsByCountry.set(row.country, list);
  }
  return new Map(
    [...brandsByCountry].map(([country, brands]) => [
      country,
      buildBrandDictionary(brands),
    ]),
  );
}

/** Ознаки картки: бренд, якщо мережа його не вказала, шукається за словником країни */
export function listingInput(
  row: ListingRow,
  dictionaries: BrandDictionaries,
  aliases?: BrandAliases,
): ListingInput {
  return {
    id: row.id,
    chainId: row.chainId,
    country: row.country,
    barcodes: row.barcodes,
    features: canonicalBrand(
      detectBrand(
        extractFeatures(row.rawName, row.rawBrand),
        dictionaries.get(row.country) ?? [],
      ),
      aliases,
    ),
    quantity: {
      measure: row.measure,
      netQuantity: row.netQuantity,
      packCount: row.packCount ?? 1,
      isWeighted: row.isWeighted,
    },
  };
}

/**
 * Ознаки для всіх карток: бренд шукаємо в назві за словником брендів тієї ж країни,
 * слова назв повертаємо окремо по країнах для IDF.
 */
export function prepareListings(
  rows: ListingRow[],
  aliases?: BrandAliases,
): {
  inputs: Map<string, ListingInput>;
  vocabulary: Map<string, string[][]>;
} {
  const dictionaries = buildDictionaries(rows);
  const inputs = new Map<string, ListingInput>();
  const vocabulary = new Map<string, string[][]>();
  for (const row of rows) {
    const input = listingInput(row, dictionaries, aliases);
    inputs.set(row.id, input);
    const docs = vocabulary.get(row.country) ?? [];
    docs.push(input.features.tokens.map((t) => t.norm));
    vocabulary.set(row.country, docs);
  }
  return { inputs, vocabulary };
}

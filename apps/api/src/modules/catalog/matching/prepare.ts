import type { ListingInput, Measure } from './catalog-index';
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

/**
 * Ознаки для всіх карток: бренд шукаємо в назві за словником брендів тієї ж країни,
 * слова назв повертаємо окремо по країнах для IDF.
 */
export function prepareListings(rows: ListingRow[]): {
  inputs: Map<string, ListingInput>;
  vocabulary: Map<string, string[][]>;
} {
  const brandsByCountry = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.rawBrand) continue;
    const list = brandsByCountry.get(row.country) ?? [];
    list.push(row.rawBrand);
    brandsByCountry.set(row.country, list);
  }
  const dictionaries = new Map(
    [...brandsByCountry].map(([country, brands]) => [
      country,
      buildBrandDictionary(brands),
    ]),
  );

  const inputs = new Map<string, ListingInput>();
  const vocabulary = new Map<string, string[][]>();
  for (const row of rows) {
    const features = detectBrand(
      extractFeatures(row.rawName, row.rawBrand),
      dictionaries.get(row.country) ?? [],
    );
    inputs.set(row.id, {
      id: row.id,
      chainId: row.chainId,
      country: row.country,
      barcodes: row.barcodes,
      features,
      quantity: {
        measure: row.measure,
        netQuantity: row.netQuantity,
        packCount: row.packCount ?? 1,
        isWeighted: row.isWeighted,
      },
    });
    const docs = vocabulary.get(row.country) ?? [];
    docs.push(features.tokens.map((t) => t.norm));
    vocabulary.set(row.country, docs);
  }
  return { inputs, vocabulary };
}

/** Скільки фото віддає картка товару */
export const IMAGES_LIMIT = 12;

/**
 * PRD-33: фото товару з усіх мереж без повторів за адресою — спершу фото товару,
 * далі фото фасувань, потім решта карток. Однакові фото з різними адресами (pHash) — ще ні.
 */
export function productImages(product: {
  imageUrl: string | null;
  variants: {
    imageUrl: string | null;
    listings: { imageUrl: string | null }[];
  }[];
}): string[] {
  const urls = new Set<string>();
  const add = (url: string | null) => {
    if (url && urls.size < IMAGES_LIMIT) urls.add(url);
  };
  add(product.imageUrl);
  for (const variant of product.variants) add(variant.imageUrl);
  for (const variant of product.variants) {
    for (const listing of variant.listings) add(listing.imageUrl);
  }
  return [...urls];
}

/** Скільки фото віддає сторінка товару */
export const IMAGES_LIMIT = 12;
/** Скільки фото віддає картка у списку: основне й запасні, якщо воно не завантажиться */
export const CARD_IMAGES_LIMIT = 4;
/** Відмінність dHash (біт із 64), за якої два фото вважаємо одним (PRD-33) */
export const SAME_IMAGE_BITS = 6;

type Photos = { imageUrl: string | null };
type VariantPhotos = Photos & { listings: Photos[] };

/**
 * Ключ фото: адреса без домену-дзеркала. img2 і img3.zakaz.ua віддають той самий файл,
 * тож мережі zakaz.ua дають одне фото під двома адресами.
 */
export const imageKey = (url: string) =>
  url.replace(/^https?:\/\/img\d+\.zakaz\.ua\//, 'zakaz:');

/** Адреси фото фасування: спершу основне, далі з його карток */
export const variantImageUrls = (variant: VariantPhotos) => [
  variant.imageUrl,
  ...variant.listings.map((listing) => listing.imageUrl),
];

/** Адреси фото товару: спершу основне, далі основні фасувань, потім решта карток */
export const productImageUrls = (
  product: Photos & { variants: VariantPhotos[] },
) => [
  product.imageUrl,
  ...product.variants.map((variant) => variant.imageUrl),
  ...product.variants.flatMap(variantImageUrls),
];

/** Скільки бітів різняться два хеші (hex, 64 біти) */
export function hammingDistance(a: string, b: string): number {
  let bits = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  for (; bits > 0n; bits &= bits - 1n) count++;
  return count;
}

/**
 * Фото без повторів, порядок зберігається (PRD-33): за адресою, за дзеркалом і, коли є хеші
 * (`imageKey` → dHash, bun run images:hash), за вмістом — мережі часто беруть фото виробника.
 */
export function distinctImages(
  urls: (string | null)[],
  hashes: ReadonlyMap<string, string> = new Map(),
  limit = IMAGES_LIMIT,
): string[] {
  const images: string[] = [];
  const keys = new Set<string>();
  const seen: string[] = [];
  for (const url of urls) {
    if (images.length === limit) break;
    if (!url) continue;
    const key = imageKey(url);
    if (keys.has(key)) continue;
    const hash = hashes.get(key);
    if (
      hash &&
      seen.some((other) => hammingDistance(other, hash) <= SAME_IMAGE_BITS)
    )
      continue;
    keys.add(key);
    if (hash) seen.push(hash);
    images.push(url);
  }
  return images;
}

/**
 * dHash за 72 яскравостями (сітка 9 × 8, по рядках): 1 — піксель світліший за правого сусіда.
 * Повертає 16 hex-символів. Стійкий до зміни розміру й стиснення.
 */
export function dHash(pixels: ArrayLike<number>): string {
  if (pixels.length !== 72)
    throw new Error(`dHash чекає 72 пікселі, отримав ${pixels.length}`);
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash = (hash << 1n) | BigInt(pixels[y * 9 + x] > pixels[y * 9 + x + 1]);
    }
  }
  return hash.toString(16).padStart(16, '0');
}

import { BadRequestException } from '@nestjs/common';

/**
 * Правила злиття й перейменування брендів (/admin/brands) без БД.
 * Ключ бренду (Brand.slug) — його ідентичність у зіставленні; назва — лише для показу.
 */

/** Нова назва бренду: обрізана, 1–100 символів */
export function brandName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('Поле «name» має бути рядком');
  }
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name)
    throw new BadRequestException('Назва бренду не може бути порожньою');
  if (name.length > 100) {
    throw new BadRequestException('Назва бренду довша за 100 символів');
  }
  return name;
}

/**
 * Slug лінійки при злитті: лінійка будується як slugify("<ключ бренду> <слова>")
 * (lineOf), тож ключ дубліката на початку замінюється ключем основного бренду —
 * і лінійка «meine-kuchen-welt-backkuchen» зливається з «meine-kuchenwelt-backkuchen».
 */
export function rekeyLineSlug(slug: string, from: string, to: string): string {
  if (slug === from) return to;
  return slug.startsWith(`${from}-`) ? `${to}${slug.slice(from.length)}` : slug;
}

/** Назва лінійки "<бренд> · <слова>" або просто "<бренд>" — з новою назвою бренду */
export function renameLine(
  name: string,
  oldBrand: string,
  newBrand: string,
): string {
  if (name === oldBrand) return newBrand;
  return name.startsWith(`${oldBrand} · `)
    ? `${newBrand}${name.slice(oldBrand.length)}`
    : name;
}

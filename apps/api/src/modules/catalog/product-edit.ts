import { BadRequestException } from '@nestjs/common';
import {
  CATEGORIES,
  brandKey,
  normalizeGtin,
  parseQuantity,
  type ParsedQuantity,
} from '@repo/matching';

/** Правки товару модератором; undefined — поле не змінюється, null — очистити */
export interface ProductPatch {
  name?: string;
  brand?: { slug: string; name: string } | null;
  variantLabel?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  /** slug з CATEGORIES; null — повернути автоматичне призначення */
  category?: string | null;
}

export interface VariantPatch {
  quantity?: ParsedQuantity;
  label?: string;
  packaging?: string | null;
}

/** Рядок з тіла запиту: обрізаний, порожній → null, задовгий або не рядок → 400 */
function text(
  value: unknown,
  field: string,
  max: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`Поле «${field}» має бути рядком`);
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length > max) {
    throw new BadRequestException(
      `Поле «${field}» задовге (до ${max} символів)`,
    );
  }
  return trimmed || null;
}

function required(value: string | null | undefined, field: string) {
  if (value === null) {
    throw new BadRequestException(`Поле «${field}» не може бути порожнім`);
  }
  return value;
}

export function productPatch(body: Record<string, unknown>): ProductPatch {
  const patch: ProductPatch = {
    name: required(text(body.name, 'назва', 200), 'назва'),
    variantLabel: text(body.variantLabel, 'різновид', 80),
    description: text(body.description, 'опис', 2000),
  };

  const brand = text(body.brand, 'бренд', 80);
  if (brand !== undefined) {
    const slug = brand && brandKey(brand);
    if (brand && !slug) {
      throw new BadRequestException(`«${brand}» не схоже на назву бренду`);
    }
    patch.brand = brand && slug ? { slug, name: brand } : null;
  }

  const imageUrl = text(body.imageUrl, 'фото', 1000);
  if (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl)) {
    throw new BadRequestException('Фото — це адреса http(s)://…');
  }
  patch.imageUrl = imageUrl;

  const category = text(body.category, 'категорія', 40);
  if (category && !CATEGORIES.some((c) => c.slug === category)) {
    throw new BadRequestException(`Невідома категорія ${category}`);
  }
  patch.category = category;

  return withoutUndefined(patch);
}

export function variantPatch(body: Record<string, unknown>): VariantPatch {
  const patch: VariantPatch = {
    label: required(text(body.label, 'підпис', 40), 'підпис'),
    packaging: text(body.packaging, 'упаковка', 40),
  };
  const quantity = required(text(body.quantity, 'фасування', 40), 'фасування');
  if (quantity !== undefined) {
    const parsed = parseQuantity(quantity);
    if (!parsed) {
      throw new BadRequestException(
        `Не вдалося розібрати фасування «${quantity}» — приклади: 0,5 л; 6 × 330 мл; 200 г; 10 шт`,
      );
    }
    patch.quantity = parsed;
  }
  return withoutUndefined(patch);
}

export function gtinOf(code: unknown): string {
  const gtin = typeof code === 'string' ? normalizeGtin(code) : null;
  if (!gtin) {
    throw new BadRequestException(
      `Некоректний штрихкод: ${String(code)} — потрібно 8, 12, 13 або 14 цифр з правильною контрольною`,
    );
  }
  return gtin;
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

import type { ListingSummaryDto, ProductDetailsDto } from '@/api/generated/model';

/** Розмір сторінки каталогу (перша — на сервері, далі — під час прокручування) */
export const PRODUCTS_PAGE_SIZE = 20;

/**
 * Що показати на сторінці товару. API вже сортує: фасування — від найпоширенішого,
 * пропозиції — спершу основна валюта (₴), усередині від найдешевшої за одиницю.
 */
export function productView(product: ProductDetailsDto, variantId?: string, currency?: string) {
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const home = currency ?? product.variants[0]?.offers[0]?.currency;
  // Усі мережі одним списком; мережі країни покупця (її валюта) — першими, далі порядок API
  const all = variant?.offers ?? [];
  const offers = [...all.filter((o) => o.currency === home), ...all.filter((o) => o.currency !== home)];

  const sizes = product.variants.map((v) => ({
    id: v.id,
    label: v.label,
    unit: v.offers.find((o) => o.currency === home && o.unitPrice !== null) ?? null,
  }));
  const units = sizes.flatMap((s) => (s.unit?.unitPrice != null ? [s.unit.unitPrice] : []));
  const bestUnit = units.length > 1 ? Math.min(...units) : null;

  return {
    variant,
    offers,
    cheapest: offers[0] as ListingSummaryDto | undefined,
    sizes: sizes.map((s) => ({ ...s, best: bestUnit !== null && s.unit?.unitPrice === bestUnit })),
    updatedAt: offers.reduce<string | null>((max, o) => (!max || o.lastSeenAt > max ? o.lastSeenAt : max), null),
  };
}

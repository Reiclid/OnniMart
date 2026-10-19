import type { ListingSummaryDto, ProductDetailsDto } from '@/api/generated/model';

/** Розмір сторінки каталогу (перша — на сервері, далі — під час прокручування) */
export const PRODUCTS_PAGE_SIZE = 20;

/**
 * Що показати на сторінці товару. API вже сортує: фасування — від найпоширенішого,
 * пропозиції — спершу основна валюта (₴), усередині від найдешевшої за одиницю.
 */
export function productView(product: ProductDetailsDto, variantId?: string) {
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const home = product.variants[0]?.offers[0]?.currency;
  const offers = variant?.offers ?? [];
  const local = offers.filter((o) => o.currency === home);

  const sizes = product.variants.map((v) => ({
    id: v.id,
    label: v.label,
    unit: v.offers.find((o) => o.currency === home && o.unitPrice !== null) ?? null,
  }));
  const units = sizes.flatMap((s) => (s.unit?.unitPrice != null ? [s.unit.unitPrice] : []));
  const bestUnit = units.length > 1 ? Math.min(...units) : null;

  return {
    variant,
    local,
    abroad: offers.filter((o) => o.currency !== home),
    cheapest: local[0] as ListingSummaryDto | undefined,
    sizes: sizes.map((s) => ({ ...s, best: bestUnit !== null && s.unit?.unitPrice === bestUnit })),
    updatedAt: local.reduce<string | null>((max, o) => (!max || o.lastSeenAt > max ? o.lastSeenAt : max), null),
  };
}

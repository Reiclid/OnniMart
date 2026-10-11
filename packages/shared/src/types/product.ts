// Спільні типи для web / mobile. Відповідають моделям apps/api/prisma/schema.prisma.

export type Currency = 'UAH' | 'EUR' | 'PLN' | 'USD';

/** Кількість зберігається в базових одиницях: MASS — г, VOLUME — мл, COUNT — шт */
export type Measure = 'MASS' | 'VOLUME' | 'COUNT';

/** Конкретний смак / різновид: "Coca-Cola Zero" */
export interface IProduct {
  id: string;
  name: string;
  slug: string;
  variantLabel: string | null;
  brand: string | null;
  imageUrl: string | null;
  variants: IProductVariant[];
}

/** Фасування: "Coca-Cola Zero 0,5 л" */
export interface IProductVariant {
  id: string;
  label: string;
  measure: Measure;
  netQuantity: number;
  packCount: number;
  isWeighted: boolean;
  barcodes: string[];
  offers: IStoreOffer[];
}

/** Ціна фасування в конкретній мережі */
export interface IStoreOffer {
  chainSlug: string;
  chainName: string;
  url: string | null;
  price: number;
  /** Ціна до знижки, якщо діє акція */
  regularPrice: number | null;
  /** Ціна за 1 кг / 1 л / 1 шт */
  unitPrice: number | null;
  currency: Currency;
  isOnPromo: boolean;
  inStock: boolean;
  updatedAt: string;
}

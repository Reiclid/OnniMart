export interface IProduct {
  id: string;
  barcodeEan: string;
  canonicalName: string;
  brand: string;
  netQuantity: number;
  unitType: 'kg' | 'g' | 'l' | 'ml' | 'pcs';
  imageUrl: string;
}

export interface IStoreOffer {
  retailerName: string;
  regularPrice: number;
  promoPrice?: number;
  normalizedPricePerKgOrLiter: number;
  currency: 'UAH' | 'PLN' | 'EUR';
  isInStock: boolean;
}
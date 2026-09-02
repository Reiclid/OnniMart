export class ScrapedProductDto {
  store: string;
  external: string;
  name: string;
  price: number;
  old_price?: number;
  image_url?: string;
  scraper_at: string;
}

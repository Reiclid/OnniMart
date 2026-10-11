/**
 * Повідомлення, яке Rust-парсер кладе в Redis-чергу `scraper:results`.
 * Назви полів — snake_case, як у serde-структурі ScrapedProduct (apps/scraper).
 */
export class ScrapedProductDto {
  /** StoreChain.slug: "atb", "silpo", "novus" */
  store: string;
  /** ID товару на сайті мережі */
  external: string;
  name: string;
  /** Ціна, яку платить покупець */
  price: number;
  /** Закреслена ціна до знижки */
  old_price?: number | null;
  image_url?: string | null;
  /** Час збору, ISO 8601 */
  scraper_at: string;

  // Необов'язкові поля — парсери заповнюють, якщо сайт їх віддає
  url?: string | null;
  brand?: string | null;
  category?: string | null;
  /** Штрихкоди зі сторінки (Сільпо, zakaz.ua) */
  barcodes?: string[];
  in_stock?: boolean;
  /** Одиниця ціни на сайті: "шт" або "кг" (ваговий товар) */
  price_unit?: string | null;
  promo_label?: string | null;
}

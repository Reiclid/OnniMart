/**
 * Повідомлення, яке Rust-парсер кладе в Redis-чергу `scraper:results`.
 * Назви полів — snake_case, як у serde-структурі ScrapedProduct (apps/scraper).
 */
export class ScrapedProductDto {
  kind?: 'product';
  /** ScrapeRun.id, якщо запуск створено через API */
  run_id?: string | null;
  /** StoreChain.slug: "silpo", "novus", "aldi-sued" */
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
  /** Штрихкоди зі сторінки (Сільпо, zakaz.ua, Globus) */
  barcodes?: string[];
  in_stock?: boolean;
  /** Одиниця ціни на сайті: "шт" або "кг" (ваговий товар) */
  price_unit?: string | null;
  /** Фасування, як його показує сайт: "0,5л", "500 g", "1,5-L-Flasche" */
  size?: string | null;
  promo_label?: string | null;
  /** Дата закінчення акції, YYYY-MM-DD */
  promo_ends_at?: string | null;
}

/** Подія життєвого циклу запуску парсера */
export class RunEventDto {
  kind: 'run_started' | 'run_finished' | 'run_failed';
  run_id?: string | null;
  store: string;
  pages_fetched: number;
  items_seen: number;
  error?: string | null;
  at: string;
}

export type ScraperMessage = ScrapedProductDto | RunEventDto;

export function isRunEvent(message: ScraperMessage): message is RunEventDto {
  return typeof message?.kind === 'string' && message.kind.startsWith('run_');
}

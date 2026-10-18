/**
 * Контракти черг Redis. Це єдине джерело правди для TypeScript-сторони;
 * Rust-сторона — apps/scraper/src/model.rs (поля — snake_case, як у serde).
 * Зразки повідомлень, які генерує парсер, — packages/contracts/fixtures.
 */

/** Завдання для Rust-парсера (API → scraper) */
export const SCRAPER_TASKS_QUEUE = 'scraper:tasks';
/** Товари та події запуску (scraper → воркер). Один список, щоб run_finished ішов після товарів */
export const SCRAPER_RESULTS_QUEUE = 'scraper:results';
/** Повідомлення, яке воркер зараз обробляє; видаляється лише після запису в БД */
export const SCRAPER_RESULTS_PROCESSING = 'scraper:results:processing';
/**
 * Повідомлення, які не вдалося обробити (некоректні або після MAX спроб).
 * Повернути в чергу: redis-cli LMOVE scraper:results:dead scraper:results RIGHT LEFT
 */
export const SCRAPER_RESULTS_DEAD = 'scraper:results:dead';
/** Запити на пакетне зіставлення (API → воркер) */
export const MATCHING_REQUESTS_QUEUE = 'matching:requests';
/** Стан зіставлення, який воркер публікує для API (JSON MatchingState) */
export const MATCHING_STATE_KEY = 'matching:state';

export interface ScraperTask {
  /** ScrapeRun.id */
  run_id: string;
  /** StoreChain.slug */
  store: string;
  /** Не більше N сторінок на категорію; null — усі */
  max_pages: number | null;
  crawl_delay_ms: number;
  created_at: string;
}

/** Товар зі сторінки мережі (ScrapedProduct + kind/run_id у Rust) */
export interface ScrapedProductMessage {
  kind?: 'product';
  /** ScrapeRun.id, якщо запуск створено через API */
  run_id?: string | null;
  /** StoreChain.slug: "silpo", "novus", "aldi-sued" */
  store: string;
  /** ID товару на сайті мережі */
  external: string;
  name: string;
  /** Ціна, яку платить покупець, в основних одиницях валюти */
  price: number;
  /** Закреслена ціна до знижки */
  old_price?: number | null;
  image_url?: string | null;
  /** Час збору, ISO 8601 (історична назва поля) */
  scraper_at: string;
  url?: string | null;
  brand?: string | null;
  category?: string | null;
  /** Штрихкоди зі сторінки, як є (нормалізує воркер) */
  barcodes?: string[];
  in_stock?: boolean;
  /** "шт" або "кг" (ваговий товар, ціна за 1 кг) */
  price_unit?: string | null;
  /** Фасування, як його показує сайт: "0,5л", "500 g" */
  size?: string | null;
  promo_label?: string | null;
  /** Дата закінчення акції, YYYY-MM-DD */
  promo_ends_at?: string | null;
}

export type RunEventKind = 'run_started' | 'run_finished' | 'run_failed';

/** Подія життєвого циклу запуску парсера */
export interface RunEventMessage {
  kind: RunEventKind;
  run_id?: string | null;
  store: string;
  pages_fetched: number;
  items_seen: number;
  error?: string | null;
  at: string;
}

export type ScraperMessage = ScrapedProductMessage | RunEventMessage;

export function isRunEvent(message: ScraperMessage): message is RunEventMessage {
  return typeof message.kind === 'string' && message.kind.startsWith('run_');
}

export type ParseResult =
  | { ok: true; message: ScraperMessage }
  | { ok: false; error: string };

const RUN_KINDS = new Set(['run_started', 'run_finished', 'run_failed']);

/** Розбирає і перевіряє повідомлення з scraper:results — межа довіри воркера */
export function parseScraperMessage(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'не JSON' };
  }
  if (!isObject(value)) return { ok: false, error: 'не обʼєкт' };
  const error =
    typeof value.kind === 'string' && value.kind.startsWith('run_')
      ? runEventError(value)
      : productError(value);
  return error
    ? { ok: false, error }
    : { ok: true, message: value as unknown as ScraperMessage };
}

function runEventError(v: Record<string, unknown>): string | null {
  if (!RUN_KINDS.has(v.kind as string)) return `невідомий kind ${String(v.kind)}`;
  if (!isText(v.store)) return 'store';
  if (!isCount(v.pages_fetched) || !isCount(v.items_seen)) return 'лічильники';
  if (!isOptional(v.run_id, isText) || !isOptional(v.error, isString)) return 'run_id/error';
  if (!isString(v.at)) return 'at';
  return null;
}

function productError(v: Record<string, unknown>): string | null {
  if (v.kind !== undefined && v.kind !== 'product') return `невідомий kind ${String(v.kind)}`;
  if (!isText(v.store)) return 'store';
  if (!isText(v.external)) return 'external';
  if (!isText(v.name)) return 'name';
  if (!isPrice(v.price)) return 'price';
  if (!isOptional(v.old_price, isPrice)) return 'old_price';
  if (!isString(v.scraper_at)) return 'scraper_at';
  if (v.barcodes !== undefined && !(Array.isArray(v.barcodes) && v.barcodes.every(isString)))
    return 'barcodes';
  if (v.in_stock !== undefined && typeof v.in_stock !== 'boolean') return 'in_stock';
  for (const key of ['run_id', 'image_url', 'url', 'brand', 'category', 'price_unit', 'size', 'promo_label', 'promo_ends_at']) {
    if (!isOptional(v[key], isString)) return key;
  }
  return null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function isText(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}
function isCount(v: unknown): boolean {
  return Number.isInteger(v) && (v as number) >= 0;
}
function isPrice(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1_000_000;
}
function isOptional(v: unknown, check: (v: unknown) => boolean): boolean {
  return v === undefined || v === null || check(v);
}

/** Звіт одного пакетного зіставлення */
export interface MatchReport {
  startedAt: string;
  finishedAt: string;
  /** Скільки незіставлених карток розглянуто */
  processed: number;
  byBarcode: number;
  fuzzy: number;
  /** Відправлено на модерацію */
  review: number;
  /** Додано як нове фасування наявного товару */
  newVariants: number;
  newProducts: number;
  /** Картку тим часом зіставив хтось інший */
  skipped: number;
  /** Помилки окремих карток (деталі — у лозі воркера) */
  failed: number;
}

/** Те, що воркер кладе в MATCHING_STATE_KEY */
export interface MatchingState {
  running: boolean;
  lastReport: MatchReport | null;
  updatedAt: string;
}

/**
 * Двигун зіставлення товарів OnniMart — без залежностей від БД і фреймворку.
 *
 *   normalization/*  розбір фасування, GTIN, нормалізація тексту;
 *   features         ознаки назви: бренд, значущі слова, ознаки різновиду, смаки;
 *   similarity       оцінка схожості пари назв;
 *   catalog-index    каталог у пам'яті, блокування кандидатів і рішення (THRESHOLDS);
 *   prepare          ознаки та IDF-словник для набору карток;
 *   naming           назви лінійок і підписи різновидів / фасувань;
 *   off-match        картки без штрихкоду → товари Open Food Facts (PRD-27);
 *   variations       варіації (смаки, сорти), вивчені з карток мереж і штрихкодів (PRD-30);
 *   concepts         поняття товару (хліб = Brot = bread) для мультимовного пошуку (PRD-19).
 */
export * from './normalization/gtin';
export * from './normalization/quantity';
export * from './normalization/text';
export * from './features';
export * from './similarity';
export * from './variations';
export * from './catalog-index';
export * from './prepare';
export * from './naming';
export * from './categories';
export * from './concepts';
export * from './off-match';

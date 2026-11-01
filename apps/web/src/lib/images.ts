/**
 * Домени фото мереж, які стискає оптимізатор Next (/_next/image: WebP потрібного розміру, кеш на сервері).
 * Лише відомі домени — інакше оптимізатор став би відкритим проксі. Фото з нового домену
 * показується як є, напряму: додайте домен сюди, коли підключаєте мережу.
 */
export const IMAGE_HOSTS = [
  'img2.zakaz.ua',
  'img3.zakaz.ua',
  's7g10.scene7.com',
  'images.silpo.ua',
  'dm.emea.cms.aldi.cx',
  'kaufland.media.schwarz',
  'media.kaufland.com',
  'varus.ua',
  'adminprodukte.globus.de',
  'www.norma-online.de',
  'cdn.penny.de',
  'images.openfoodfacts.org',
  'images.openbeautyfacts.org',
];

/** Чи можна віддати фото через оптимізатор */
export function optimizable(src: string): boolean {
  try {
    return IMAGE_HOSTS.includes(new URL(src).hostname);
  } catch {
    return false;
  }
}

/**
 * Ширина копії фото з оптимізатора. Одна на всі екрани (оригінали мереж — 280–400 px), а не
 * окрема під кожну ширину й щільність екрана: так кожне фото має в кеші одну копію, яку можна
 * прогріти заздалегідь (scripts/warm-images.ts), і телефон та ноутбук беруть ту саму.
 * Головне фото сторінки товару — більша копія.
 */
export const PHOTO_WIDTH = 640;
export const HERO_WIDTH = 1080;

/** Адреса копії в оптимізаторі Next; той самий рядок — ключ кешу, тож прогрів має збігатися з ним */
export const photoUrl = (src: string, width: number = PHOTO_WIDTH) => `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;

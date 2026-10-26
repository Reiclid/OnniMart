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

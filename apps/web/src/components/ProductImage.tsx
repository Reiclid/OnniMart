'use client';

import Image from 'next/image';
import { useState } from 'react';
import { HERO_WIDTH, optimizable, photoUrl, PHOTO_WIDTH } from '@/lib/images';

/**
 * Фото товару з сайту мережі: FIT на білому. Адреса не відкрилась (битий URL, домен недоступний) —
 * наступна з `fallbacks`; не лишилось жодної або фото немає взагалі — нейтральна плашка з
 * піктограмою того самого розміру, тож макет не зсувається.
 * Відомі домени йдуть через оптимізатор Next (WebP, кеш на сервері) — замість оригіналів
 * по 100–200 КБ з десятка доменів; одна копія на фото (PHOTO_WIDTH, у головного — HERO_WIDTH),
 * а не під кожен екран, — її заздалегідь прогріває `bun run images:warm`. Проявляється лише
 * після decode() (docs/07-motion.md §4.1), щоб не малювалось частинами. Під час зміни фото
 * (інше фасування) попереднє лишається знизу, доки нове не готове, — виходить перетікання.
 */
export function ProductImage({
  src,
  fallbacks = [],
  className = '',
  preload,
}: {
  src: string | null;
  /** Запасні фото цього товару з інших карток; перше, що відкрилось, замінює `src` */
  fallbacks?: readonly string[];
  className?: string;
  /** Головне фото сторінки (LCP) */
  preload?: boolean;
}) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const [ready, setReady] = useState<string | null>(null);
  const current = [src, ...fallbacks].find((url) => url && !failed.includes(url));
  const show = (url: string, img: HTMLImageElement) =>
    void img.decode().catch(() => undefined).then(() => setReady(url));
  const layers = ready && ready !== current && !failed.includes(ready) ? [ready, current] : [current];

  return (
    <div className={`relative overflow-hidden rounded-md bg-page ${className}`}>
      {current ? (
        layers.map(
          (url) =>
            url && (
              <Image
                key={url}
                src={url}
                alt=""
                fill
                preload={preload}
                unoptimized={!optimizable(url)}
                loader={({ src }) => photoUrl(src, preload ? HERO_WIDTH : PHOTO_WIDTH)}
                data-ready={url === ready || undefined}
                // Фото з кешу могло завантажитись ще до гідратації — тоді onLoad уже не прийде
                ref={(img) => {
                  if (img?.complete && img.naturalWidth > 0) show(url, img);
                }}
                onLoad={(e) => show(url, e.currentTarget)}
                // Помилку до гідратації next/image повторює сам (перезадає src), коли є onError
                onError={() => setFailed((list) => [...list, url])}
                className="photo bg-surface object-contain"
              />
            ),
        )
      ) : (
        <PhotoPlaceholder />
      )}
    </div>
  );
}

/** Рамка з пейзажем; колір і розмір від плашки — і в мініатюрі 40 px, і в hero */
function PhotoPlaceholder() {
  return (
    <div className="absolute inset-0 grid place-items-center text-line-strong">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-1/3 max-h-16 max-w-16 min-h-4 min-w-4">
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="m4 18 5-5 3 3 3.5-3.5L20 17" />
      </svg>
    </div>
  );
}

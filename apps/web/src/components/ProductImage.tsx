'use client';

import Image from 'next/image';
import { useState } from 'react';
import { HERO_WIDTH, optimizable, photoUrl, PHOTO_WIDTH } from '@/lib/images';

/**
 * Фото товару з сайту мережі: FIT на білому; без фото — нейтральна плашка.
 * Відомі домени йдуть через оптимізатор Next (WebP, кеш на сервері) — замість оригіналів
 * по 100–200 КБ з десятка доменів; одна копія на фото (PHOTO_WIDTH, у головного — HERO_WIDTH),
 * а не під кожен екран, — її заздалегідь прогріває `bun run images:warm`. Проявляється лише
 * після decode() (docs/07-motion.md §4.1), щоб не малювалось частинами.
 */
export function ProductImage({
  src,
  className = '',
  preload,
}: {
  src: string | null;
  className?: string;
  /** Головне фото сторінки (LCP) */
  preload?: boolean;
}) {
  const [ready, setReady] = useState(false);
  if (!src) return <div className={`rounded-md bg-page ${className}`} />;
  const show = (img: HTMLImageElement) => void img.decode().catch(() => undefined).then(() => setReady(true));
  return (
    <div className={`relative overflow-hidden rounded-md bg-page ${className}`}>
      <Image
        src={src}
        alt=""
        fill
        preload={preload}
        unoptimized={!optimizable(src)}
        loader={({ src }) => photoUrl(src, preload ? HERO_WIDTH : PHOTO_WIDTH)}
        data-ready={ready || undefined}
        // Фото з кешу могло завантажитись ще до гідратації — тоді onLoad уже не прийде
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) show(img);
        }}
        onLoad={(e) => show(e.currentTarget)}
        onError={() => setReady(true)}
        className="photo bg-surface object-contain"
      />
    </div>
  );
}

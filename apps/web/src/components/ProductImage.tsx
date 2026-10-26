'use client';

import Image from 'next/image';
import { useState } from 'react';
import { optimizable } from '@/lib/images';

/**
 * Фото товару з сайту мережі: FIT на білому; без фото — нейтральна плашка.
 * Відомі домени йдуть через оптимізатор Next (WebP під `sizes`, кеш на сервері) — замість
 * оригіналів по 100–200 КБ з десятка доменів. Проявляється лише після decode()
 * (docs/07-motion.md §4.1), щоб не малювалось частинами.
 */
export function ProductImage({
  src,
  className = '',
  sizes = '96px',
  preload,
}: {
  src: string | null;
  className?: string;
  /** Ширина на екрані, як у `<img sizes>`: з неї оптимізатор вибирає розмір */
  sizes?: string;
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
        sizes={sizes}
        preload={preload}
        unoptimized={!optimizable(src)}
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

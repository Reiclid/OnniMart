'use client';

import Image, { getImageProps } from 'next/image';
import { useState } from 'react';
import { optimizable } from '@/lib/images';

/**
 * Фото товару з сайту мережі: FIT на білому; без фото — нейтральна плашка.
 * Відомі домени йдуть через оптимізатор Next (WebP під `sizes`, кеш на сервері) — замість
 * оригіналів по 100–200 КБ з десятка доменів. Поки фото вантажиться, під ним — крихітна
 * (32 px, < 1 КБ) розмита копія; повне фото проявляється з розмиття лише після decode()
 * (docs/07-motion.md §4.1), щоб не малювалось частинами. Фото з кешу — одразу, без анімації.
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
  const [ready, setReady] = useState<'loaded' | 'cached' | null>(null);
  if (!src) return <div className={`rounded-md bg-page ${className}`} />;
  const show = (img: HTMLImageElement, how: 'loaded' | 'cached') =>
    void img
      .decode()
      .catch(() => undefined)
      .then(() => setReady((r) => r ?? how));
  const optimized = optimizable(src);
  const blurred = optimized ? getImageProps({ src, alt: '', width: 16, height: 16 }).props.src : null;
  return (
    <div className={`relative overflow-hidden rounded-md bg-page ${className}`}>
      {blurred && ready !== 'cached' && (
        // eslint-disable-next-line @next/next/no-img-element -- заглушка 32 px з оптимізатора, next/image тут зайвий
        <img src={blurred} alt="" aria-hidden loading={preload ? 'eager' : 'lazy'} className="absolute inset-0 size-full scale-105 object-contain blur-sm" />
      )}
      <Image
        src={src}
        alt=""
        fill
        sizes={sizes}
        preload={preload}
        unoptimized={!optimized}
        data-ready={ready ?? undefined}
        // Фото з кешу могло завантажитись ще до гідратації — тоді onLoad уже не прийде
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) show(img, 'cached');
        }}
        onLoad={(e) => show(e.currentTarget, 'loaded')}
        onError={() => setReady('loaded')}
        className="photo bg-surface object-contain"
      />
    </div>
  );
}

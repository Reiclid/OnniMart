'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/client';
import { ProductImage } from './ProductImage';

/** Мініатюра 64 px + проміжок 8 px */
const THUMB_STEP = 72;

/**
 * Галерея фото в hero сторінки товару (PRD-33, Figma: Product gallery 04.11): квадратна стрічка зі
 * свайпом (scroll-snap), на телефоні лічильник, від md — мініатюри. Биті фото випадають зі стрічки;
 * не лишилось жодного з `images` — беремо `fallback`, потім заглушка. Перше фото міняється на місці,
 * тож обране фасування перетікає в ProductImage, а квадрат не зсуває макет. Одне фото — та сама
 * стрічка без лічильника й мініатюр.
 */
export function ProductGallery({ images, fallback = [] }: { images: readonly string[]; fallback?: readonly string[] }) {
  const t = useT();
  const track = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [broken, setBroken] = useState<readonly string[]>([]);
  const [index, setIndex] = useState(0);

  const alive = (list: readonly string[]) => list.filter((url) => !broken.includes(url));
  const slides = alive(images).length > 0 ? alive(images) : alive(fallback);
  const current = Math.min(index, Math.max(slides.length - 1, 0));
  const drop = (url: string) => setBroken((list) => [...list, url]);

  // Інше фасування — нова стрічка з початку; лічильник оновить подія scroll
  const many = slides.length > 1;
  const set = images.join();
  useEffect(() => {
    track.current?.scrollTo({ left: 0 });
    strip.current?.scrollTo({ left: 0 });
  }, [set]);

  const go = (i: number) => {
    const target = Math.max(0, Math.min(i, slides.length - 1));
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const el = track.current;
    el?.scrollTo({ left: target * el.clientWidth, behavior });
    const row = strip.current;
    row?.scrollTo({ left: target * THUMB_STEP - (row.clientWidth - THUMB_STEP) / 2, behavior });
  };

  const label = (i: number) => t('product.photoOf', { current: i + 1, total: slides.length });
  // Стрілки — і зі стрічки, і з мініатюри, на якій лишився фокус після кліку
  return (
    <div
      className="space-y-2"
      onKeyDown={(e) => {
        if (!many || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        e.preventDefault();
        go(current + (e.key === 'ArrowRight' ? 1 : -1));
      }}
    >
      <div className="relative">
        <div
          ref={track}
          role="group"
          aria-label={t('product.photos')}
          tabIndex={many ? 0 : undefined}
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-md [scrollbar-width:none]"
        >
          {(many ? slides : [slides[0] ?? null]).map((url, i) => (
            // Ключ — позиція: перше фото міняється на місці, і ProductImage робить перетікання
            <div key={i} role="group" aria-label={label(i)} className="w-full shrink-0 snap-start">
              <ProductImage src={url} preload={i === 0} hero onFail={drop} className="aspect-square w-full" />
            </div>
          ))}
        </div>
        {many && <span aria-hidden className="absolute right-3 bottom-3 rounded-full border border-line bg-surface/90 px-2.5 py-1 text-caption font-semibold tabular-nums md:hidden">
          {current + 1} / {slides.length}
        </span>}
      </div>
      {many && <div ref={strip} className="hidden gap-2 overflow-x-auto [scrollbar-width:none] md:flex">
        {slides.map((url, i) => (
          <button
            key={url}
            type="button"
            aria-label={label(i)}
            aria-current={i === current ? 'true' : undefined}
            onClick={() => go(i)}
            className={`press size-16 shrink-0 overflow-hidden rounded-md ${i === current ? 'border-2 border-accent' : 'border border-line hover:border-line-strong'}`}
          >
            <ProductImage src={url} onFail={drop} className="size-full" />
          </button>
        ))}
      </div>}
    </div>
  );
}

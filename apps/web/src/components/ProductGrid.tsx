'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProductSummaryDto } from '@/api/generated/model';
import { moreProducts } from '@/app/(shop)/actions';
import { ProductCard, productCard } from './ProductCard';

/** Каталог у дві колонки (Figma: For you); наступні сторінки — під час прокручування */
export function ProductGrid({ first, total, q, chain }: { first: ProductSummaryDto[]; total: number; q?: string; chain?: string }) {
  const [items, setItems] = useState(first);
  // Кінець списку або збій: більше не підвантажуємо
  const [done, setDone] = useState(false);
  const loading = useRef(false);
  const page = useRef(1);
  const end = useRef<HTMLDivElement>(null);
  const hasMore = items.length < total && !done;

  useEffect(() => {
    if (!hasMore || !end.current) return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loading.current) return;
        loading.current = true;
        try {
          const next = await moreProducts({ q, chain, page: page.current + 1 });
          page.current += 1;
          // Каталог міг змінитись між сторінками — без дублів
          setItems((prev) => [...prev, ...next.filter((p) => !prev.some((x) => x.id === p.id))]);
          if (next.length === 0) setDone(true);
        } catch {
          setDone(true);
        } finally {
          loading.current = false;
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(end.current);
    return () => observer.disconnect();
    // Після кожної сторінки — заново: якщо кінець списку ще видно, підвантажимо далі
  }, [hasMore, items.length, q, chain]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((product) => (
          <ProductCard key={product.id} card={productCard(product)} />
        ))}
      </div>
      {hasMore && (
        <div ref={end} className="py-6 text-center text-body-sm text-fg-muted" aria-live="polite">
          Loading more…
        </div>
      )}
    </>
  );
}

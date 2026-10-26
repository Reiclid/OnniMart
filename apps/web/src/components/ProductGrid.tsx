'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProductSummaryDto } from '@/api/generated/model';
import { moreProducts } from '@/app/(shop)/actions';
import { useT } from '@/i18n/client';
import type { Money } from '@/lib/country';
import { cascade, productCard } from './ProductCard';
import { ProductMasonry } from './ProductMasonry';

/** Каталог у дві колонки (Figma: For you); наступні сторінки — під час прокручування */
export function ProductGrid({
  first,
  total,
  filters,
  money,
}: {
  first: ProductSummaryDto[];
  total: number;
  filters: { q?: string; chain?: string; category?: string };
  money: Money;
}) {
  const t = useT();
  const [items, setItems] = useState(first);
  // Кінець списку або збій: більше не підвантажуємо
  const [done, setDone] = useState(false);
  // Початок останньої довантаженої сторінки: лише вона з'являється каскадом (перша — одразу)
  const [pageStart, setPageStart] = useState(Infinity);
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
          const next = await moreProducts({ ...filters, page: page.current + 1 });
          page.current += 1;
          // Каталог міг змінитись між сторінками — без дублів
          setPageStart(items.length);
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
  }, [hasMore, items.length, filters]);

  return (
    <>
      <ProductMasonry
        items={items.map((product, i) => ({ card: productCard(product, t, money), motion: cascade(i - pageStart, { limit: 6, stagger: 20, y: 8 }) }))}
      />
      {hasMore && (
        <div ref={end} className="py-6 text-center text-body-sm text-fg-muted" aria-live="polite">
          {t('catalog.loadingMore')}
        </div>
      )}
    </>
  );
}

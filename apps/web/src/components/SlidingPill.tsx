'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * Сегменти фасувань (docs/07-motion.md §4.4): біла «пігулка» під вибраним `[aria-current]`
 * переїжджає під новий сегмент пружиною smooth — одразу на дотик, ще до відповіді сервера.
 * Ширина анімується (виняток §6.3: порожній абсолютний елемент).
 */
export function SlidingPill({ className, children }: { className: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  const moveTo = (target: Element | null, animate: boolean) => {
    const el = pill.current;
    if (!el || !(target instanceof HTMLElement)) return;
    el.style.transitionDuration = animate ? '' : '0s';
    el.style.translate = `${target.offsetLeft}px ${target.offsetTop}px`;
    el.style.width = `${target.offsetWidth}px`;
    el.style.height = `${target.offsetHeight}px`;
    el.style.opacity = '1';
    box.current?.setAttribute('data-ready', '');
  };

  // Після кожного рендеру (новий ?v=) — до вибраного; перший раз і зміна розміру — без руху
  useLayoutEffect(() => {
    const first = pill.current?.style.opacity !== '1';
    moveTo(box.current?.querySelector('[aria-current]') ?? null, !first);
  });
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => moveTo(box.current?.querySelector('[aria-current]') ?? null, false));
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={box}
      className={`relative ${className}`}
      onClick={(e) => {
        const target = (e.target as Element).closest('a');
        // Вибір видно одразу, ще до відповіді сервера; рендер з новим ?v= поставить те саме
        box.current?.querySelector('[aria-current]')?.removeAttribute('aria-current');
        target?.setAttribute('aria-current', 'true');
        moveTo(target, true);
      }}
    >
      <span
        ref={pill}
        aria-hidden
        className="absolute top-0 left-0 rounded-sm bg-surface opacity-0 shadow-floating transition-[translate,width,height] duration-(--duration-spring-smooth) ease-spring-smooth"
      />
      {children}
    </div>
  );
}

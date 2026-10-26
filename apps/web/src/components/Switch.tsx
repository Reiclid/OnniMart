'use client';

/**
 * Перемикач (Figma: Toggle on/off, 44 × 26): зміна одразу надсилає свою форму.
 * Кружок їде пружиною snappy, фон перетікає за `fast` (docs/07-motion.md §4.6).
 */
export function Switch({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        role="switch"
        name={name}
        defaultChecked={defaultChecked}
        aria-label={label}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="peer h-6.5 w-11 cursor-pointer appearance-none rounded-full bg-line-strong transition-colors duration-(--duration-fast) ease-standard checked:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-0.75 left-0.75 size-5 rounded-full bg-surface shadow-floating transition-[translate] duration-(--duration-spring-snappy) ease-spring-snappy peer-checked:translate-x-4.5"
      />
    </span>
  );
}

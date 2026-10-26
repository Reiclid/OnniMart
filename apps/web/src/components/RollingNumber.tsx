'use client';

import { useState } from 'react';

/**
 * Ціна-лічильник (docs/07-motion.md §4.4): кожна цифра — барабан 0–9, що прокручується до нової
 * цифри пружиною smooth; незмінні цифри стоять. Розряди вирівняні справа, `tabular-nums` тримає
 * ширину. Новий розряд ліворуч (9 → 12) розсувається з нуля, зайвий (12 → 9) стискається до нуля —
 * ширина через `grid-template-columns` 0fr ↔ 1fr, бо `width: auto` не анімується в Safari.
 * Перший показ — без руху: transition спрацьовує лише на зміну.
 */
export function RollingNumber({ value, className = '' }: { value: string; className?: string }) {
  // Попереднє значення — щоб знати, скільки розрядів зникло (стискаються) або з'явилось (розсуваються)
  const [prev, setPrev] = useState({ value, lost: '', grew: 0 });
  if (prev.value !== value) {
    const diff = [...value].length - [...prev.value].length;
    setPrev({ value, lost: diff < 0 ? [...prev.value].slice(0, -diff).join('') : '', grew: Math.max(diff, 0) });
  }
  const lost = [...prev.lost];
  const chars = [...value];
  const total = lost.length + chars.length;

  return (
    <span className={`inline-flex tabular-nums ${className}`}>
      <span className="sr-only">{value}</span>
      <span aria-hidden className="inline-flex">
        {[...lost, ...chars].map((char, i) => {
          // Ключ — розряд від кінця: «9,90» → «12,90» додає ліворуч новий барабан, решта ті самі
          const key = total - i;
          const gone = i < lost.length;
          const born = !gone && i - lost.length < prev.grew;
          return (
            <span
              key={key}
              className={`inline-grid transition-[grid-template-columns,opacity] duration-(--duration-spring-smooth) ease-spring-smooth ${
                gone ? 'grid-cols-[0fr] opacity-0' : 'grid-cols-[1fr]'
              } ${born ? 'starting:grid-cols-[0fr] starting:opacity-0' : ''}`}
            >
              <span className="min-w-0 overflow-hidden">
                {/\d/.test(char) ? (
                  <span className="block h-[1lh] overflow-hidden">
                    <span
                      className="flex flex-col transition-[translate] duration-(--duration-spring-smooth) ease-spring-smooth"
                      style={{ translate: `0 ${-Number(char) * 10}%` }}
                    >
                      {DIGITS.map((d) => (
                        <span key={d} className="h-[1lh]">{d}</span>
                      ))}
                    </span>
                  </span>
                ) : (
                  <span className="whitespace-pre">{char}</span>
                )}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

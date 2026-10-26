import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/** Дрібні примітиви дизайн-системи (Figma: Foundations · Components) */

export const buttonStyles = {
  primary: 'press inline-flex items-center justify-center gap-2 rounded-md bg-brand px-5 py-3.5 text-body font-semibold text-white hover:bg-[color-mix(in_oklch,var(--color-brand),black_8%)] active:bg-[color-mix(in_oklch,var(--color-brand),black_8%)]',
  secondary: 'press inline-flex items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 py-3.5 text-body font-semibold text-fg hover:bg-page active:bg-page',
};

/** Списки налаштувань (Figma 08, 12, 17–19): заголовок секції, картка з рядками, підказка під нею */
export const listStyles = {
  heading: 'text-caption font-semibold uppercase text-fg-muted',
  card: 'divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface',
  row: 'flex w-full items-center gap-3 px-4 py-3.5 text-left text-body',
  link: 'transition-colors duration-(--duration-fast) hover:bg-page active:bg-page',
  value: 'max-w-[55%] truncate text-body-sm text-fg-muted',
  hint: 'text-body-sm text-fg-muted',
};

/** Фільтр мережі або смаку; Selected — bg/selected + border/brand (border-accent) */
export function Chip({ href, selected, replace, children }: { href: string; selected?: boolean; replace?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      // replace — перемикач на тій самій глибині (смак): «Назад» веде туди, звідки прийшли, а не на попередній смак
      replace={replace}
      scroll={!replace}
      aria-current={selected ? 'page' : undefined}
      className={`press shrink-0 rounded-full border px-3.5 [--press-scale:0.96] py-2 text-body-sm font-semibold ${
        selected ? 'border-accent bg-selected text-brand' : 'border-line bg-surface text-fg hover:border-line-strong'
      }`}
    >
      {children}
    </Link>
  );
}

export { ProductImage } from './ProductImage';

type IconProps = ComponentProps<'svg'>;
const icon = (props: IconProps, children: ReactNode) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
    {children}
  </svg>
);

export const SearchIcon = (props: IconProps) => icon(props, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);

export const ScanIcon = (props: IconProps) =>
  icon(props, <><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M8 7v10M12 7v10M16 7v10" /></>);

export const HomeIcon = (props: IconProps) => icon(props, <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>);

export const GridIcon = (props: IconProps) =>
  icon(props, <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);

export const BellIcon = (props: IconProps) => icon(props, <><path d="M18 17V8A6 6 0 0 0 6 8v9" /><path d="M3.5 17h17" /><path d="M10.3 20.5a1.94 1.94 0 0 0 3.4 0" /></>);

export const HeartIcon = (props: IconProps) =>
  icon(props, <path d="M12 20.5s-8-4.6-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 6-8 10.6-8 10.6Z" />);

export const CheckIcon = (props: IconProps) => icon(props, <path d="m5 12.5 4.5 4.5L19 7" />);
export const ChevronLeftIcon = (props: IconProps) => icon(props, <path d="m15 18-6-6 6-6" />);

/** Верхній рядок вкладеної сторінки (Figma: Top bar): «Назад», заголовок, дія праворуч */
export function PageHeader({ back, backLabel, title, action }: { back: string; backLabel: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Link href={back} aria-label={backLabel} className="press grid size-11 shrink-0 place-items-center rounded-md bg-surface text-icon">
        <ChevronLeftIcon width={22} height={22} />
      </Link>
      <h1 className="flex-1 text-title font-bold">{title}</h1>
      {action}
    </div>
  );
}

export const UserIcon = (props: IconProps) => icon(props, <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);

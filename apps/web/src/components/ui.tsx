import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/** Дрібні примітиви дизайн-системи (Figma: Foundations · Components) */

export const buttonStyles = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-md bg-brand px-5 py-3.5 text-body font-semibold text-white hover:opacity-90',
  secondary: 'inline-flex items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 py-3.5 text-body font-semibold text-fg hover:bg-page',
};

/** Фільтр мережі або смаку; Selected — bg/selected + border/brand */
export function Chip({ href, selected, children }: { href: string; selected?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={selected ? 'page' : undefined}
      className={`shrink-0 rounded-full border px-3.5 py-2 text-body-sm font-semibold ${
        selected ? 'border-brand bg-selected text-brand' : 'border-line bg-surface text-fg hover:border-line-strong'
      }`}
    >
      {children}
    </Link>
  );
}

/** Фото товару з сайту мережі: FIT на білому; без фото — нейтральна плашка */
export function ProductImage({ src, className = '' }: { src: string | null; className?: string }) {
  if (!src) return <div className={`rounded-md bg-page ${className}`} />;
  // eslint-disable-next-line @next/next/no-img-element -- зображення з десятків доменів мереж
  return <img src={src} alt="" loading="lazy" className={`rounded-md bg-surface object-contain ${className}`} />;
}

type IconProps = ComponentProps<'svg'>;
const icon = (props: IconProps, children: ReactNode) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
    {children}
  </svg>
);

export const SearchIcon = (props: IconProps) => icon(props, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);

export const ScanIcon = (props: IconProps) =>
  icon(props, <><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M8 7v10M12 7v10M16 7v10" /></>);

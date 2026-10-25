import { getT } from '@/i18n/server';
import { Chip } from './ui';

type Filters = { q?: string; chain?: string; category?: string };

/** Фільтр каталогу (категорія або мережа) — зберігає решту параметрів пошуку */
const LABELS = {
  category: { label: 'filters.categories', all: 'filters.allCategories' },
  chain: { label: 'filters.chains', all: 'filters.allChains' },
} as const;

export async function FilterChips({
  param,
  items,
  filters,
}: {
  param: 'chain' | 'category';
  items: { value: string; label: string }[];
  filters: Filters;
}) {
  const href = (value?: string) => {
    const query = new URLSearchParams(
      Object.entries({ ...filters, [param]: value }).filter((e): e is [string, string] => !!e[1]),
    );
    return `/products?${query.toString()}`;
  };
  const t = await getT();
  return (
    <nav aria-label={t(LABELS[param].label)} className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      <Chip href={href()} selected={!filters[param]}>
        {t(LABELS[param].all)}
      </Chip>
      {items.map((item) => (
        <Chip key={item.value} href={href(item.value)} selected={item.value === filters[param]}>
          {item.label}
        </Chip>
      ))}
    </nav>
  );
}

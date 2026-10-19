import { Chip } from './ui';

type Filters = { q?: string; chain?: string; category?: string };

/** Фільтр каталогу (категорія або мережа) — зберігає решту параметрів пошуку */
export function FilterChips({
  label,
  param,
  items,
  filters,
}: {
  label: string;
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
  return (
    <nav aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      <Chip href={href()} selected={!filters[param]}>
        All {label.toLowerCase()}
      </Chip>
      {items.map((item) => (
        <Chip key={item.value} href={href(item.value)} selected={item.value === filters[param]}>
          {item.label}
        </Chip>
      ))}
    </nav>
  );
}

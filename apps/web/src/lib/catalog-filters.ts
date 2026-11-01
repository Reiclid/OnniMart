/** Фільтри каталогу (/products): пошук, категорія, мережа, лише в 2+ мережах */
export interface CatalogFilters {
  q?: string;
  category?: string;
  chain?: string;
  multiChain?: boolean;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

export function parseCatalogFilters(params: Record<string, string | string[] | undefined>): CatalogFilters {
  return {
    q: first(params.q)?.trim() || undefined,
    category: first(params.category),
    chain: first(params.chain),
    multiChain: first(params.multiChain) === 'true' || undefined,
  };
}

/** Адреса каталогу з фільтрами; порожні не потрапляють в URL */
export function catalogHref(filters: CatalogFilters): string {
  const query = new URLSearchParams();
  if (filters.q) query.set('q', filters.q);
  if (filters.category) query.set('category', filters.category);
  if (filters.chain) query.set('chain', filters.chain);
  if (filters.multiChain) query.set('multiChain', 'true');
  const search = query.toString();
  return search ? `/products?${search}` : '/products';
}

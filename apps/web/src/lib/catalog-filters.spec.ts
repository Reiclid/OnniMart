import { catalogHref, parseCatalogFilters } from './catalog-filters';

describe('фільтри каталогу', () => {
  it('читає параметри: порожні й зайві — геть', () => {
    expect(parseCatalogFilters({ q: '  milk ', chain: ['silpo', 'novus'], category: '', multiChain: 'true' })).toEqual({
      q: 'milk',
      chain: 'silpo',
      category: undefined,
      multiChain: true,
    });
    expect(parseCatalogFilters({ multiChain: 'false' }).multiChain).toBeUndefined();
  });

  it('без запиту фільтри лишаються (пошук стерли)', () => {
    expect(catalogHref({ q: '', category: 'dairy-eggs', chain: 'silpo', multiChain: true })).toBe(
      '/products?category=dairy-eggs&chain=silpo&multiChain=true',
    );
    expect(catalogHref({})).toBe('/products');
  });
});

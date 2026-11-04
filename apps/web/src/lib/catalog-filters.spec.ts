import { catalogHref, parseCatalogFilters } from './catalog-filters';

describe('фільтри каталогу', () => {
  it('читає параметри: порожні й зайві — геть', () => {
    expect(parseCatalogFilters({ q: '  milk ', chain: ['silpo', 'novus'], category: '', onPromo: 'true', multiChain: 'true' })).toEqual({
      q: 'milk',
      chain: 'silpo',
      category: undefined,
      onPromo: true,
      multiChain: true,
    });
    expect(parseCatalogFilters({ multiChain: 'false' }).multiChain).toBeUndefined();
    expect(parseCatalogFilters({ onPromo: 'false' }).onPromo).toBeUndefined();
  });

  it('без запиту фільтри лишаються (пошук стерли)', () => {
    expect(catalogHref({ q: '', category: 'dairy-eggs', chain: 'silpo', onPromo: true, multiChain: true })).toBe(
      '/products?category=dairy-eggs&chain=silpo&onPromo=true&multiChain=true',
    );
    expect(catalogHref({})).toBe('/products');
  });
});

import { interleave, topCategories } from './recommendations';

const items = (...ids: string[]) => ids.map((id) => ({ id }));

describe('topCategories', () => {
  it('за кількістю підписок, без порожніх, не більше ліміту', () => {
    expect(
      topCategories(
        [
          'drinks',
          'dairy-eggs',
          'drinks',
          null,
          'pets',
          'dairy-eggs',
          'drinks',
        ],
        2,
      ),
    ).toEqual(['drinks', 'dairy-eggs']);
    expect(topCategories([null, null])).toEqual([]);
  });
});

describe('interleave', () => {
  it('по черзі з кожної категорії, без підписаних і повторів', () => {
    const drinks = items('cola', 'water', 'juice');
    const dairy = items('milk', 'water', 'kefir');
    expect(
      interleave([drinks, dairy], new Set(['cola']), 4).map((p) => p.id),
    ).toEqual(['milk', 'water', 'juice', 'kefir']);
  });

  it('ліміт і порожні списки', () => {
    expect(
      interleave([items('a', 'b', 'c')], new Set(), 2).map((p) => p.id),
    ).toEqual(['a', 'b']);
    expect(interleave([], new Set(), 5)).toEqual([]);
  });
});

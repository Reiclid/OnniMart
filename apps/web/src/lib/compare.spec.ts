import { compareWords, sameValue } from './compare';

describe('compareWords', () => {
  it('спільні слова без регістру, відмінні — окремо, проміжки зберігаються', () => {
    const tokens = compareWords('Молоко Селянське 2,5% 900г', 'молоко селянське ультрапастеризоване 2,5%');
    expect(tokens.map((t) => t.text).join('')).toBe('Молоко Селянське 2,5% 900г');
    expect(tokens.filter((t) => !t.shared).map((t) => t.text)).toEqual(['900г']);
  });

  it('апостроф не заважає', () => {
    expect(compareWords("М'ясо", 'мясо').every((t) => t.shared)).toBe(true);
  });
});

describe('sameValue', () => {
  it('фасування й бренд: регістр, пробіли й кома не важать, невідоме — null', () => {
    expect(sameValue('0,5 л', '0.5л')).toBe(true);
    expect(sameValue('Coca-Cola', 'coca-cola')).toBe(true);
    expect(sameValue('0,5 л', '1 л')).toBe(false);
    expect(sameValue(null, '1 л')).toBeNull();
    // ALDI SÜD: апостроф гострим наголосом
    expect(sameValue('JACK´S FARM', "JACK'S FARM")).toBe(true);
  });
});

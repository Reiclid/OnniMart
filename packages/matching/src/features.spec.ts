import {
  brandKey,
  buildBrandDictionary,
  detectBrand,
  extractFeatures,
} from './features';

const norms = (name: string, brand?: string) =>
  extractFeatures(name, brand).tokens.map((t) => t.norm);

describe('brandKey', () => {
  it.each([
    ['Coca-Cola', 'coca-cola'],
    ['Coca Cola', 'coca-cola'],
    ['COCA-COLA', 'coca-cola'],
    ['Моршинська', 'morshynska'],
    ['Яготинське для дітей', 'iahotynske-dlia-ditey'],
    ['TM Галичина', 'halychyna'],
    ['Ritter Sport®', 'ritter-sport'],
    // ALDI SÜD пише апостроф гострим наголосом (U+00B4), інші — ' або ’
    ["JACK'S FARM", 'jacks-farm'],
    ['JACK´S FARM', 'jacks-farm'],
    ['JACK’S FARM', 'jacks-farm'],
  ])('%s → %s', (raw, key) => {
    expect(brandKey(raw)).toBe(key);
  });

  it('порожній бренд і заглушки — null', () => {
    expect(brandKey(null)).toBeNull();
    expect(brandKey('  ')).toBeNull();
    expect(brandKey('Без ТМ')).toBeNull();
  });
});

describe('extractFeatures', () => {
  it('прибирає бренд, фасування й службові слова', () => {
    expect(
      norms('Вода мінеральна Моршинська негазована 1,5л', 'Моршинська'),
    ).toEqual(['вода', 'мінеральна']);
    expect(
      norms('Вода мінеральна «Моршинська» негазована', 'Моршинська'),
    ).toEqual(['вода', 'мінеральна']);
    expect(norms('Напій газований Coca-Cola 0,5л', 'Coca-Cola')).toEqual([]);
  });

  it('розпізнає ознаки різновиду', () => {
    const zero = extractFeatures(
      'Напій Coca-Cola Zero безалкогольний сильногазований',
      'Coca-Cola',
    );
    expect(zero.attributes).toEqual({ sugar: 'zero', gas: 'sparkling' });
    expect(zero.tokens).toEqual([]);

    expect(
      extractFeatures(
        'Йогурт Галичина Карпатський без цукру 3% 1кг',
        'Галичина',
      ).attributes,
    ).toEqual({ sugar: 'zero', percent: '3' });
    expect(
      extractFeatures('Молоко «Галичина» пастеризоване безлактозне 2,5%')
        .attributes,
    ).toEqual({ lactose: 'free', percent: '2.5' });
    expect(extractFeatures('Cola, zuckerfrei', 'Coca Cola').attributes).toEqual(
      {
        sugar: 'zero',
      },
    );
  });

  it('не плутає негазовану воду з газованою', () => {
    expect(extractFeatures('Вода негазована').attributes).toEqual({
      gas: 'still',
    });
    expect(extractFeatures('Вода слабогазована').attributes).toEqual({
      gas: 'medium',
    });
    expect(extractFeatures('Вода сильногазована').attributes).toEqual({
      gas: 'sparkling',
    });
  });

  it('бере органічну ознаку з бренду власної марки', () => {
    expect(extractFeatures('Vollmilch 3,8 %', 'GUT BIO').attributes).toEqual({
      organic: 'bio',
      percent: '3.8',
    });
  });

  it('виправляє латинські літери в кириличних словах', () => {
    expect(
      norms('Йогурт Яготинське для дiтей Чорниця', 'Яготинське для дітей'),
    ).toEqual(
      norms('Йогурт Яготинське для дітей Чорниця', 'Яготинське для дітей'),
    );
  });

  it('залишає заперечення разом зі словом і знаходить смаки', () => {
    const features = extractFeatures('Борошно гречане без глютену');
    expect(features.tokens.map((t) => t.norm)).toContain('без глютену');
    expect(
      extractFeatures(
        'Паста сиркова Яготинське для дітей банан 3,9%',
        'Яготинське для дітей',
      ).flavours.map((t) => t.surface),
    ).toEqual(['банан']);
  });
});

describe('detectBrand', () => {
  const dictionary = buildBrandDictionary([
    'Coca-Cola',
    'RIVER',
    'Bio',
    'Моршинська',
  ]);

  it('знаходить відомий бренд у назві без бренду', () => {
    const features = detectBrand(extractFeatures('Coca-Cola'), dictionary);
    expect(features.brand).toBe('coca-cola');
    expect(features.tokens).toEqual([]);
  });

  it('не чіпає картки з уже відомим брендом і звичайні слова', () => {
    expect(
      detectBrand(extractFeatures('Cola Classic', 'RIVER'), dictionary).brand,
    ).toBe('river');
    expect(dictionary.map((d) => d.key)).not.toContain('bio');
  });
});

describe('кількість штук', () => {
  it('стає ознакою, якщо поруч є вага чи обʼєм', () => {
    expect(
      extractFeatures('Пакети для сміття Fino 60л 20шт Міцні').attributes,
    ).toEqual({
      pieces: '20',
    });
    expect(extractFeatures('Ватні диски Lady Cotton 100шт').attributes).toEqual(
      {
        pieces: '100',
      },
    );
    expect(extractFeatures('Йогурт 125 г').attributes).toEqual({});
  });
});

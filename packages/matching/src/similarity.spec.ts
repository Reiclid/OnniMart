import { extractFeatures } from './features';
import {
  attributeConflict,
  brandSimilarity,
  buildIdf,
  idfFromCounts,
  nameSimilarity,
  scorePair,
  tokenSimilarity,
} from './similarity';

const flat = () => 1;

describe('idfFromCounts', () => {
  it('дає ті самі ваги, що й buildIdf за документами', () => {
    const docs = [['молоко', 'слива'], ['молоко'], ['молоко', 'молоко']];
    const fromDocs = buildIdf(docs);
    const fromCounts = idfFromCounts(
      3,
      new Map([
        ['молоко', 3],
        ['слива', 1],
      ]),
    );
    for (const token of ['молоко', 'слива', 'невідоме'])
      expect(fromCounts(token)).toBe(fromDocs(token));
  });
});

describe('tokenSimilarity', () => {
  it('враховує відмінки та роди, але не різні слова', () => {
    expect(tokenSimilarity('мінеральна', 'мінеральна')).toBe(1);
    expect(tokenSimilarity('мінеральна', 'мінеральний')).toBe(0.9);
    expect(tokenSimilarity('яготинське', 'яготинськии')).toBe(0.9);
    expect(tokenSimilarity('сир', 'сироп')).toBe(0);
    expect(tokenSimilarity('milch', 'milchreis')).toBe(0);
    expect(tokenSimilarity('3', '6')).toBe(0);
  });
});

describe('nameSimilarity', () => {
  it('однакові назви — 1, різні — 0', () => {
    expect(
      nameSimilarity(['вода', 'мінеральна'], ['вода', 'мінеральна'], flat),
    ).toBe(1);
    expect(nameSimilarity(['кава'], ['чаи'], flat)).toBe(0);
    expect(nameSimilarity([], [], flat)).toBe(1);
    expect(nameSimilarity([], ['cherry'], flat)).toBe(0);
  });

  it('рідкісне відмінне слово знижує схожість сильніше за часте', () => {
    const idf = buildIdf([
      ['паста', 'сиркова', 'банан'],
      ['паста', 'сиркова', 'малина'],
      ['паста', 'сиркова', 'персик'],
      ['паста', 'томатна'],
      ['сиркова', 'маса'],
    ]);
    const same = nameSimilarity(
      ['паста', 'сиркова', 'малина'],
      ['паста', 'сиркова', 'малина'],
      idf,
    );
    const plusRare = nameSimilarity(
      ['паста', 'сиркова', 'малина'],
      ['паста', 'сиркова', 'малина', 'слива'],
      idf,
    );
    const otherFlavour = nameSimilarity(
      ['паста', 'сиркова', 'малина'],
      ['паста', 'сиркова', 'банан'],
      idf,
    );
    expect(same).toBeCloseTo(1);
    expect(plusRare).toBeLessThan(0.9);
    expect(plusRare).toBeGreaterThan(otherFlavour);
    expect(otherFlavour).toBeLessThan(0.7);
  });
});

describe('brandSimilarity', () => {
  it.each([
    ['coca-cola', 'coca-cola', 1],
    ['cocacola', 'coca-cola', 1],
    ['iahotynske', 'iahotynske-dlia-ditey', 0.8],
    ['coca-cola', null, 0.85],
    [null, null, 1],
    ['coca-cola', 'pepsi', 0],
  ])('%s / %s → %s', (a, b, expected) => {
    expect(brandSimilarity(a, b)).toBe(expected);
  });
});

describe('attributeConflict', () => {
  it('Zero і звичайна — різні товари, навіть якщо в одній назві ознаки немає', () => {
    expect(attributeConflict({ sugar: 'zero' }, {})).toBe('sugar');
    expect(attributeConflict({ sugar: 'zero' }, { sugar: 'light' })).toBe(
      'sugar',
    );
    expect(attributeConflict({ percent: '2.5' }, { percent: '3.2' })).toBe(
      'percent',
    );
  });

  it('газованість і відсоток можуть бути не вказані в одній з назв', () => {
    expect(attributeConflict({ gas: 'sparkling' }, {})).toBeNull();
    expect(attributeConflict({ percent: '2.5' }, {})).toBeNull();
    expect(attributeConflict({ gas: 'still' }, { gas: 'still' })).toBeNull();
  });
});

describe('scorePair на реальних назвах', () => {
  const score = (a: [string, string?], b: [string, string?]) =>
    scorePair(extractFeatures(...a), extractFeatures(...b), flat).score;

  it('назви лише зі службових слів і без бренду — не той самий товар', () => {
    expect(score(['Пакет 0,5 л'], ['Пляшка ПЕТ 0,5 л'])).toBe(0);
  });

  it('лише бренд з обох боків — той самий товар', () => {
    expect(score(['Coca-Cola 0,5л', 'Coca-Cola'], ['Coca-Cola 0,5 л', 'Coca-Cola'])).toBe(1);
  });

  it('Сільпо і Ашан: та сама вода', () => {
    expect(
      score(
        ['Вода мінеральна «Моршинська» негазована', 'Моршинська'],
        ['Вода мінеральна Моршинська негазована 1,5л', 'Моршинська'],
      ),
    ).toBe(1);
  });

  it('негазована і слабогазована — різні', () => {
    expect(
      score(
        ['Вода мінеральна Моршинська негазована 1,5л', 'Моршинська'],
        ['Вода мінеральна Моршинська слабогазована 1,5л', 'Моршинська'],
      ),
    ).toBe(0);
  });

  it('Coca-Cola і Coca-Cola Zero — різні', () => {
    expect(
      score(
        ['Напій газований Coca-Cola 1,75л', 'Coca-Cola'],
        ['Напій Coca-Cola Zero', 'Coca-Cola'],
      ),
    ).toBe(0);
    expect(
      score(
        ['Напій газований Coca-Cola 0,5л', 'Coca-Cola'],
        ['Напій Coca-Cola', 'Coca-Cola'],
      ),
    ).toBe(1);
  });

  it('молоко 2,5% звичайне і безлактозне — різні', () => {
    expect(
      score(
        ['Молоко Галичина ультрапастеризоване 2,5% 950г', 'Галичина'],
        [
          'Молоко Галичина безлактозне ультрапастеризоване 2,5% 950г',
          'Галичина',
        ],
      ),
    ).toBe(0);
  });

  it('різні бренди — 0', () => {
    expect(
      score(['Cola Zero 1,5 l', 'RIVER'], ['Cola Zero 1,25 l', 'COCA-COLA']),
    ).toBe(0);
  });
});

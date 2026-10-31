import {
  computeUnitPrice,
  formatQuantity,
  parseQuantity,
  stripQuantity,
} from './quantity';

describe('parseQuantity', () => {
  it.each([
    ['Напій Coca-Cola 0,5л', 'VOLUME', 500],
    ['Напій Fanta 1750мл Україна', 'VOLUME', 1750],
    ['Coca-Cola Zero 1.5L PET', 'VOLUME', 1500],
    ['Вода мінеральна Моршинська 2 літри', 'VOLUME', 2000],
    ['Кетчуп 250 г Своя лінія д/п', 'MASS', 250],
    ['Приправа-топінг 20 г Avocado Up м/уп', 'MASS', 20],
    ['Пельмені Геркулес 1кг', 'MASS', 1000],
    ['Молоко 2,5% 900 г', 'MASS', 900],
    ['Milka Alpenmilch 100 g', 'MASS', 100],
    ['Yfood Drink 0,5 l', 'VOLUME', 500],
    ['Яйця курячі С1 10 шт', 'COUNT', 10],
    ['Eier Freilandhaltung 10 Stück', 'COUNT', 10],
  ])('%s → %s %d', (name, measure, netQuantity) => {
    expect(parseQuantity(name)).toEqual({
      measure,
      netQuantity,
      packCount: 1,
      isWeighted: false,
    });
  });

  it('розпізнає мультипаки', () => {
    expect(parseQuantity('Пиво Corona Extra 6х0,33 л')).toEqual({
      measure: 'VOLUME',
      netQuantity: 1980,
      packCount: 6,
      isWeighted: false,
    });
    expect(parseQuantity('Йогурт Danone 4 x 125 г')).toMatchObject({
      measure: 'MASS',
      netQuantity: 500,
      packCount: 4,
    });
    expect(parseQuantity('Пиво Львівське 0,5л*12шт')).toMatchObject({
      measure: 'VOLUME',
      netQuantity: 6000,
      packCount: 12,
    });
  });

  it('кількість пляшок після обʼєму — упаковка напоїв (METRO)', () => {
    expect(
      parseQuantity('Вода мінеральна Миргородська сильногазована 1,5л 6шт'),
    ).toEqual({
      measure: 'VOLUME',
      netQuantity: 9000,
      packCount: 6,
      isWeighted: false,
    });
    expect(parseQuantity('Сосиски 300 г 6 шт')).toMatchObject({
      measure: 'MASS',
      netQuantity: 300,
      packCount: 1,
    });
    expect(
      parseQuantity('Пакети для сміття Fino Міцні 60л 40шт'),
    ).toMatchObject({
      measure: 'VOLUME',
      netQuantity: 60000,
      packCount: 1,
    });
  });

  it('розпізнає німецькі позначення з дефісом (ALDI Nord)', () => {
    expect(parseQuantity('1,5-L-Flasche')).toMatchObject({
      measure: 'VOLUME',
      netQuantity: 1500,
    });
    expect(parseQuantity('1-Liter-Flasche')).toMatchObject({
      measure: 'VOLUME',
      netQuantity: 1000,
    });
    expect(parseQuantity('6 x 0,5-Liter-Flasche')).toMatchObject({
      netQuantity: 3000,
      packCount: 6,
    });
    expect(parseQuantity('6×0,33-L-Flasche')).toMatchObject({
      netQuantity: 1980,
      packCount: 6,
    });
    expect(parseQuantity('Coca-Cola Zero')).toBeNull();
  });

  it('читає німецький роздільник тисяч у г / мл (ALDI Nord, PENNY)', () => {
    expect(parseQuantity('1.000-g-Packung')).toMatchObject({
      measure: 'MASS',
      netQuantity: 1000,
    });
    expect(parseQuantity('1.000 ml')).toMatchObject({
      measure: 'VOLUME',
      netQuantity: 1000,
    });
    expect(parseQuantity('1.240-g-Dose')).toMatchObject({ netQuantity: 1240 });
    expect(parseQuantity('Ketchup 1.170 ml')).toMatchObject({
      netQuantity: 1170,
    });
    // У літрах і кілограмах крапка — десяткова (VARUS)
    expect(parseQuantity('Напій енергетичний Red Bull 0.473 л')).toMatchObject({
      netQuantity: 473,
    });
    expect(parseQuantity('Гель для прання 1.575 л')).toMatchObject({
      netQuantity: 1575,
    });
    expect(parseQuantity('Regenbogenforellen 1,035 kg')).toMatchObject({
      netQuantity: 1035,
    });
  });

  it('не бере дозу в мг за фасування (Сільпо)', () => {
    expect(
      parseQuantity('Solgar L-Carnitine (Л-Карнітин) 500 мг таблетки №30'),
    ).toBeNull();
    expect(parseQuantity('Вітамін C 500 мг 30 г')).toMatchObject({
      measure: 'MASS',
      netQuantity: 30,
    });
  });

  it('віддає перевагу вазі над штуками', () => {
    expect(parseQuantity('Сосиски Алан 6 шт 300 г')).toMatchObject({
      measure: 'MASS',
      netQuantity: 300,
    });
  });

  it('розпізнає вагові товари', () => {
    expect(parseQuantity('Сир Гауда ваговий 45%')).toEqual({
      measure: 'MASS',
      netQuantity: 1000,
      packCount: 1,
      isWeighted: true,
    });
  });

  it('не плутає відсотки та літери з одиницями', () => {
    expect(parseQuantity('Чай Lipton 25 пак')).toBeNull();
    expect(parseQuantity('Гриби 4 гриби')).toBeNull();
    expect(parseQuantity('Coca-Cola')).toBeNull();
  });
});

describe('computeUnitPrice', () => {
  it('рахує ціну за 1 л / 1 кг / 1 шт', () => {
    expect(computeUnitPrice(25, parseQuantity('Coca-Cola 0,5 л'))).toBe(50);
    expect(computeUnitPrice(19.9, parseQuantity('Приправа 20 г'))).toBe(995);
    expect(computeUnitPrice(65, parseQuantity('Яйця 10 шт'))).toBe(6.5);
    expect(computeUnitPrice(199, parseQuantity('Пиво 6х0,33 л'))).toBe(100.51);
  });

  it('для вагового товару ціна вже за 1 кг', () => {
    expect(computeUnitPrice(389.9, parseQuantity('Сир ваговий'))).toBe(389.9);
  });

  it('повертає null, якщо кількість невідома', () => {
    expect(computeUnitPrice(25, parseQuantity('Coca-Cola'))).toBeNull();
  });
});

describe('formatQuantity', () => {
  it.each([
    ['Coca-Cola 0,5 л', '0,5 л'],
    ['Пиво 6х0,33 л', '6 × 0,33 л'],
    ['Кетчуп 250 г', '250 г'],
    ['Пельмені 1,5 кг', '1,5 кг'],
    ['Яйця 10 шт', '10 шт'],
  ])('%s → %s', (name, label) => {
    expect(formatQuantity(parseQuantity(name)!)).toBe(label);
  });
});

describe('stripQuantity', () => {
  it.each([
    [
      'Вода мінеральна Моршинська негазована 1,5л',
      'Вода мінеральна Моршинська негазована',
    ],
    ['Cola Zero 1,25 l', 'Cola Zero'],
    ['Пиво Corona 6х0,33 л', 'Пиво Corona'],
    [
      'Dessert im Glas 60 g, Double Chocolate',
      'Dessert im Glas, Double Chocolate',
    ],
    ['Großtafel 250 g', 'Großtafel'],
    [
      'Молоко Галичина ультрапастеризоване 2,5% 950г',
      'Молоко Галичина ультрапастеризоване 2,5%',
    ],
    ['Coca-Cola', 'Coca-Cola'],
  ])('%s → %s', (name, stripped) => {
    expect(stripQuantity(name)).toBe(stripped);
  });
});

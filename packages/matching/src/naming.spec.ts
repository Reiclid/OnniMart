import { extractFeatures } from './features';
import { variantLabelOf } from './naming';

describe('variantLabelOf', () => {
  it.each([
    [
      'Вода мінеральна Моршинська Спорт негазована 0,75л',
      'Моршинська',
      'Спорт · негазована',
    ],
    ['Вода мінеральна Моршинська негазована 1,5л', 'Моршинська', 'негазована'],
    [
      'Паста сиркова Яготинське для дітей банан 3,9% 90г',
      'Яготинське для дітей',
      'банан · 3,9%',
    ],
    ['Напій Coca-Cola Zero 0,5л', 'Coca-Cola', 'Zero'],
    ['Напій Coca-Cola 0,5л', 'Coca-Cola', null],
  ])('%s → %s', (name, brand, label) => {
    expect(variantLabelOf(extractFeatures(name, brand))).toBe(label);
  });
});

import { categoryOf, productCategory } from './categories';

describe('categoryOf', () => {
  it.each([
    // категорії мереж: українською, транслітом у slug, німецькою
    ['Яйця та молочні продукти', 'dairy-eggs'],
    ['molochni-produkty-ta-iaitsia-234', 'dairy-eggs'],
    ['joghurt-quark-milchdesserts', 'dairy-eggs'],
    ["М'ясо та ковбасні вироби", 'meat'],
    ['kovbasni-vyroby-i-m-iasni-delikatesy-4731', 'meat'],
    ['Fleisch, Geflügel, Wurst', 'meat'],
    ['Риба та морепродукти', 'fish'],
    ['Фрукти, овочі, горіхи', 'fruit-veg'],
    ['Obst, Gemüse, Pflanzen', 'fruit-veg'],
    ['Хлібобулочні вироби', 'bakery'],
    ['Бакалія', 'pantry'],
    ['Cоуси та спеції', 'pantry'],
    ['Заморожені продукти', 'frozen'],
    ['Кулінарія', 'ready-meals'],
    ['Кондитерські вироби та солодощі', 'sweets-snacks'],
    ['Kaffee, Tee, Süßwaren, Knabberartikel', 'coffee-tea'],
    ['Чай, кава, гарячі напої', 'coffee-tea'],
    ['Вода, соки, напої', 'drinks'],
    ['Getränke, Spirituosen', 'alcohol'],
    ['Безалкогольні напої', 'drinks'],
    ['alkogol-22', 'alcohol'],
    ['Товари для дітей', 'baby'],
    ['Товари для тварин', 'pets'],
    ['Побутова хімія', 'household'],
    ['Гігієна та догляд', 'beauty'],
    ['Канцелярія', 'other'],
    ['Цигарки, стіки, аксесуари', 'other'],
  ])('%s → %s', (text, slug) => {
    expect(categoryOf(text)).toBe(slug);
  });

  it.each([
    // рекламні категорії — не категорія
    ['Nächste Woche'],
    ['ЗнижкоLove'],
    ['Open Prices'],
    [null],
  ])('%s → null', (text) => {
    expect(categoryOf(text)).toBeNull();
  });

  it.each([
    // назви товарів, коли категорія мережі нічого не каже
    ['Напій газований Coca-Cola 1,25л', 'drinks'],
    ['Вода мінеральна Моршинська негазована 1,5л', 'drinks'],
    ['Пиво Оболонь Світле 0,5л', 'alcohol'],
    ['Шоколад молочний Milka 90г', 'sweets-snacks'],
    ['Молоко Галичина 2,5% 950г', 'dairy-eggs'],
    ['Сироп кленовий 250мл', null],
  ])('назва %s → %s', (name, slug) => {
    expect(categoryOf(name)).toBe(slug);
  });
});

describe('productCategory', () => {
  it('більшість карток; рекламна категорія → за назвою', () => {
    expect(
      productCategory([
        { rawCategory: 'Напої', rawName: 'Напій газований Coca-Cola' },
        { rawCategory: 'Rabatt-Monat', rawName: 'Coca-Cola 1,25 л' },
        { rawCategory: 'Солодощі', rawName: 'Coca-Cola' },
      ]),
    ).toBe('drinks');
    expect(productCategory([{ rawCategory: 'Open Prices', rawName: 'Щось незрозуміле' }])).toBeNull();
  });
});

import { CATEGORIES } from './categories';
import { CONCEPTS, conceptLabels, conceptOf, conceptPath, conceptTerms, queryConcept } from './concepts';

describe('conceptOf', () => {
  it.each([
    // українська: головне слово — перше
    ['Хліб Київхліб Британський сендвіч Рустикальний цільнозерновий нарізаний', 'bakery', 'bread'],
    ['Батон Литовський', 'bakery', 'bread'],
    ['Хлібці Auchan гречані хрусткі', 'pantry', 'crispbread'],
    ['Шоколад молочний Millennium Golden Nut', 'sweets-snacks', 'chocolate'],
    ['Молоко згущене Metro Chef незбиране з цукром 8,5%', 'dairy-eggs', 'condensed-milk'],
    ['Сир кисломолочний «Молокія» 5%', 'dairy-eggs', 'cottage-cheese'],
    ['Milch-Haselnuss-Schnitte', 'dairy-eggs', null],
    ['Сир Комо Кантрі зі смаком топленого молока нарізка 50%', 'dairy-eggs', 'cheese'],
    ['Біфідойогурт Активіа без цукру 1,5%', 'dairy-eggs', 'yogurt'],
    ['Яйця курячі Ясенсвіт М С1', 'dairy-eggs', 'eggs'],
    ['Батончик Nuts Duo шоколадний з лісовими горіхами', 'sweets-snacks', 'bars'],
    ['Пиво Оболонь Світле 0,5л', 'alcohol', 'beer'],
    ['Чай чорний Lovare Assorted', 'coffee-tea', 'tea'],
    // німецька та англійська: головне слово — останнє
    ['Vollmilchschokolade', 'sweets-snacks', 'chocolate'],
    ['Butterkekse', 'sweets-snacks', 'cookies'],
    ['Nuss-Rosinen-Schwarzbrot', 'bakery', 'bread'],
    ['Hamburger-Brötchen', 'bakery', 'rolls'],
    ['Knäckebrot', 'bakery', 'crispbread'],
    ['Käsewürfel, Butterkäse & Edamer', 'dairy-eggs', 'cheese'],
    ['Sahnejoghurt, Erdbeere', 'dairy-eggs', 'yogurt'],
    ['Apfelsaft klar', 'drinks', 'juice'],
    ['Thunfisch in Öl', 'pantry', 'tuna'],
    ['Tennessee Whiskey', 'alcohol', 'whisky'],
    ['Yippi Eistee, Beeren-Mix', 'drinks', 'tea'],
    ['Croissants', null, 'croissant'],
    // хибна категорія мережі не заважає, коли назва починається з поняття
    ['Молоко Галичина безлактозне ультрапастеризоване 2,5%', 'pantry', 'milk'],
    ['Локшина The Ramen Way зі смаком тушкованої свинини', 'meat', 'pasta'],
  ])('%s → %s', (name, category, slug) => {
    expect(conceptOf(name, category)).toBe(slug);
  });

  it.each([
    // начинка після прийменника — не товар
    ['Біфштекс в беконі яловичина та свинина', 'meat'],
    ['Скумбрія Banga в олії', 'pantry'],
    ['Erbsen mit Möhren', 'fruit-veg'],
    // категорія відкидає чуже поняття: "Alpenmilch" у солодощах — шоколад Milka, не молоко
    ['Milka Alpenmilch', 'sweets-snacks'],
    ['Палички мясні курячі сирокопчені', 'sweets-snacks'],
    ['Alaska Seelachs', 'frozen'],
    ['Тарілки одноразові', 'household'],
    ['Куркума Metro Chef мелена сушена', 'pantry'],
    ['Масляна Aro філе-шматок холодного копчення', 'fish'],
  ])('%s → null', (name, category) => {
    expect(conceptOf(name, category)).toBeNull();
  });
});

describe('довідник', () => {
  const slugs = new Set(CONCEPTS.map((c) => c.slug));
  const categories = new Set<string>(CATEGORIES.map((c) => c.slug));

  it('унікальні slug, наявні батьки й категорії, назви всіма мовами', () => {
    expect(slugs.size).toBe(CONCEPTS.length);
    for (const c of CONCEPTS) {
      if (c.parent) expect(slugs).toContain(c.parent);
      for (const category of c.categories) expect(categories).toContain(category);
      expect(c.names.de.length && c.names.en.length).toBeTruthy();
    }
  });

  it('предки й споріднені', () => {
    expect(conceptPath('bread')).toEqual(['bread', 'bakery']);
    const { names, related } = conceptTerms('bread');
    expect(names).toEqual(expect.arrayContaining(['хліб', 'Brot', 'bread', 'випічка', 'Backwaren']));
    expect(related).toEqual(expect.arrayContaining(['круасан', 'Kuchen', 'muffin']));
    expect(related).not.toContain('хліб');
    expect(conceptTerms('eggs').related).toEqual([]);
    expect(conceptTerms('unknown')).toEqual({ names: [], related: [] });
  });
});

describe('queryConcept', () => {
  it.each([
    ['молоко', 'milk'],
    ['Milch', 'milk'],
    ['milk', 'milk'],
    ['хліб', 'bread'],
    ['Brot', 'bread'],
    ['молоко галичина', 'milk'],
    ['масло вершкове', 'butter'],
    ['молочні продукти', 'dairy'],
    ['Backwaren', 'bakery'],
    ['згущене молоко', 'condensed-milk'],
    ['кава з молоком', 'coffee'],
  ])('%s → %s', (query, slug) => {
    expect(queryConcept(query)).toBe(slug);
  });

  it('бренди й незнайомі слова — без поняття', () => {
    expect(queryConcept('Milka')).toBeNull();
    expect(queryConcept('Моршинська')).toBeNull();
    expect(queryConcept('')).toBeNull();
  });

  it('власні назви всіма мовами, без предків', () => {
    expect(conceptLabels('milk')).toEqual(['молоко', 'Milch', 'milk']);
    expect(conceptLabels('nope')).toEqual([]);
  });
});

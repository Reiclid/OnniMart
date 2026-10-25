import type { CategorySlug } from './categories';
import { fold } from './normalization/text';

/**
 * Поняття товару (PRD-19): "хліб" = Brot = bread, батьківське — "випічка", сусіди за батьком
 * (круасан, торт) — споріднені. Пошук отримує назви всіма мовами, тож запит "хліб"
 * знаходить і німецький Brot, а з нижчою вагою — решту випічки.
 *
 * shortcut: довідник у коді, як CATEGORIES; таблиці concepts / concept_names — коли
 * модератори редагуватимуть його без релізу.
 */
export interface Concept {
  slug: string;
  parent?: string;
  /** Категорії каталогу, де поняття можливе: "Шоколад молочний" у солодощах — не молоко */
  categories: CategorySlug[];
  names: { uk: string[]; de: string[]; en: string[] };
  /**
   * Основи слів у назві після fold() (й → и, ї → і, ä → a, ß → ss).
   * "^" — початок слова (українські основи); без нього — будь-де (німецькі складні слова).
   */
  stems?: string[];
}

export const CONCEPTS: Concept[] = [
  // Випічка
  { slug: 'bakery', categories: ['bakery'], names: { uk: ['випічка'], de: ['Backwaren', 'Gebäck'], en: ['bakery', 'baked goods'] } },
  { slug: 'bread', parent: 'bakery', categories: ['bakery'], names: { uk: ['хліб', 'хлібина', 'батон'], de: ['Brot', 'Laib'], en: ['bread', 'loaf'] },
    stems: ['^хліб(?!ц)', '^батон(?!ч)', 'brot(?!ch|aufstrich)', '^bread', '^loaf'] },
  { slug: 'baguette', parent: 'bakery', categories: ['bakery'], names: { uk: ['багет'], de: ['Baguette'], en: ['baguette'] },
    stems: ['^багет', 'baguet'] },
  { slug: 'flatbread', parent: 'bakery', categories: ['bakery'], names: { uk: ['лаваш', 'піта', 'тортилья'], de: ['Fladenbrot', 'Wraps'], en: ['flatbread', 'pita', 'tortilla'] },
    stems: ['^лаваш', '^піт[аи](?!\\p{L})', '^тортил', 'fladenbrot', 'flatbread', 'tortilla', '^wraps?(?!\\p{L})'] },
  { slug: 'rolls', parent: 'bakery', categories: ['bakery'], names: { uk: ['булка', 'булочка'], de: ['Brötchen', 'Semmel'], en: ['bun', 'roll'] },
    stems: ['^булк', '^булочк', 'brotchen', 'semmel', '^buns?(?!\\p{L})'] },
  { slug: 'croissant', parent: 'bakery', categories: ['bakery', 'frozen'], names: { uk: ['круасан'], de: ['Croissant'], en: ['croissant'] },
    stems: ['^круасан', 'croissant'] },
  { slug: 'cake', parent: 'bakery', categories: ['bakery', 'sweets-snacks'], names: { uk: ['торт', 'тістечко'], de: ['Kuchen', 'Torte'], en: ['cake'] },
    stems: ['^торт(?!ил)', '^тістечк', '(?<!pfann)kuchen', 'torte(?!l)', 'cakes?(?!\\p{L})'] },
  { slug: 'muffin', parent: 'bakery', categories: ['bakery', 'sweets-snacks'], names: { uk: ['кекс', 'мафін'], de: ['Muffin'], en: ['muffin', 'cupcake'] },
    stems: ['^кекс', '^мафін', 'muffin', 'cupcake'] },
  { slug: 'crispbread', parent: 'bakery', categories: ['bakery', 'pantry', 'sweets-snacks'], names: { uk: ['хлібці'], de: ['Knäckebrot', 'Reiswaffeln'], en: ['crispbread', 'rice cakes'] },
    stems: ['^хлібц', 'knackebrot', 'crispbread', 'reiswaffel'] },

  // Молочне
  { slug: 'dairy', categories: ['dairy-eggs'], names: { uk: ['молочні продукти', 'молочка'], de: ['Milchprodukte'], en: ['dairy'] } },
  { slug: 'milk', parent: 'dairy', categories: ['dairy-eggs'], names: { uk: ['молоко'], de: ['Milch'], en: ['milk'] },
    stems: ['^молок', 'milch(?!reis)', '^milk(?!\\p{L})'] },
  { slug: 'condensed-milk', parent: 'dairy', categories: ['dairy-eggs', 'pantry', 'sweets-snacks'], names: { uk: ['згущене молоко', 'згущенка'], de: ['Kondensmilch'], en: ['condensed milk'] },
    stems: ['^молоко згущ', '^згущ', 'kondensmilch', 'condensed milk'] },
  { slug: 'kefir', parent: 'dairy', categories: ['dairy-eggs'], names: { uk: ['кефір'], de: ['Kefir'], en: ['kefir'] },
    stems: ['^кефір', 'kefir'] },
  { slug: 'yogurt', parent: 'dairy', categories: ['dairy-eggs'], names: { uk: ['йогурт'], de: ['Joghurt'], en: ['yogurt'] },
    stems: ['[иі]огурт', 'jog?hurt', 'yog?h?urt'] },
  { slug: 'sour-cream', parent: 'dairy', categories: ['dairy-eggs'], names: { uk: ['сметана'], de: ['Schmand', 'saure Sahne'], en: ['sour cream'] },
    stems: ['^сметан', 'schmand', 'saure sahne', 'sauerrahm', 'sour cream'] },
  { slug: 'cream', parent: 'dairy', categories: ['dairy-eggs'], names: { uk: ['вершки'], de: ['Sahne'], en: ['cream'] },
    stems: ['^вершк(?!ов)', 'sahne', '^cream(?!\\p{L})'] },
  { slug: 'butter', parent: 'dairy', categories: ['dairy-eggs'], names: { uk: ['масло вершкове'], de: ['Butter'], en: ['butter'] },
    stems: ['^масл(?!ин|ян)', 'butter'] },
  { slug: 'cottage-cheese', parent: 'dairy', categories: ['dairy-eggs'], names: { uk: ['кисломолочний сир', 'творог'], de: ['Quark', 'Hüttenkäse'], en: ['cottage cheese', 'quark'] },
    stems: ['^сир кисломол', '^кисломолочн[иі]и сир', '^творог', 'quark', 'huttenkase', 'cottage cheese'] },
  { slug: 'cheese', parent: 'dairy', categories: ['dairy-eggs'], names: { uk: ['сир'], de: ['Käse'], en: ['cheese'] },
    stems: ['^сир(?![онц])', '^моцарел', '^пармезан', '^бринз', '^фет[аи]', 'kase', 'mozzarella', 'gouda', 'cheese', 'parmesan', 'emmentaler', 'cheddar'] },
  { slug: 'eggs', categories: ['dairy-eggs'], names: { uk: ['яйця'], de: ['Eier'], en: ['eggs'] },
    stems: ['^яиц', '^eier', '^eggs?(?!\\p{L})'] },

  // Солодощі та снеки
  { slug: 'sweets', categories: ['sweets-snacks'], names: { uk: ['солодощі', 'кондитерські вироби'], de: ['Süßigkeiten', 'Süßwaren'], en: ['sweets', 'confectionery'] } },
  { slug: 'chocolate', parent: 'sweets', categories: ['sweets-snacks'], names: { uk: ['шоколад'], de: ['Schokolade'], en: ['chocolate'] },
    stems: ['^шоколад(?!н)', 'schokolad', 'chocolat'] },
  { slug: 'candy', parent: 'sweets', categories: ['sweets-snacks'], names: { uk: ['цукерки'], de: ['Bonbons', 'Pralinen'], en: ['candy'] },
    stems: ['^цукерк', '^карамел', 'bonbon', 'pralin', 'gummi', '^candy'] },
  { slug: 'cookies', parent: 'sweets', categories: ['sweets-snacks', 'bakery'], names: { uk: ['печиво'], de: ['Kekse'], en: ['cookies', 'biscuits'] },
    stems: ['^печив', 'keks', 'cookie', 'biscuit'] },
  { slug: 'wafers', parent: 'sweets', categories: ['sweets-snacks', 'bakery'], names: { uk: ['вафлі'], de: ['Waffeln'], en: ['wafers'] },
    stems: ['^вафл', 'waffel', 'wafer'] },
  { slug: 'bars', parent: 'sweets', categories: ['sweets-snacks', 'fruit-veg', 'bakery'], names: { uk: ['батончик'], de: ['Riegel'], en: ['bar'] },
    stems: ['^батончик', 'riegel'] },
  { slug: 'gingerbread', parent: 'sweets', categories: ['sweets-snacks', 'bakery'], names: { uk: ['пряники'], de: ['Lebkuchen'], en: ['gingerbread'] },
    stems: ['^пряник', 'lebkuchen', 'gingerbread'] },
  { slug: 'snacks', categories: ['sweets-snacks'], names: { uk: ['снеки', 'закуски'], de: ['Snacks', 'Knabberartikel'], en: ['snacks'] } },
  { slug: 'chips', parent: 'snacks', categories: ['sweets-snacks'], names: { uk: ['чипси'], de: ['Chips'], en: ['crisps', 'chips'] },
    stems: ['^чипс', 'chips', 'crisps'] },
  { slug: 'nuts', parent: 'snacks', categories: ['sweets-snacks', 'fruit-veg', 'pantry'], names: { uk: ['горіхи'], de: ['Nüsse'], en: ['nuts'] },
    stems: ['^горіх', '^горішк', '^арахіс', '^мигдал', '^кеш[юь]', '^фундук', 'nuss', 'mandel', 'cashew', '^nuts?(?!\\p{L})', 'peanut'] },
  { slug: 'crackers', parent: 'snacks', categories: ['sweets-snacks', 'bakery', 'pantry'], names: { uk: ['крекери'], de: ['Cracker'], en: ['crackers'] },
    stems: ['^крекер', 'cracker'] },
  { slug: 'popcorn', parent: 'snacks', categories: ['sweets-snacks'], names: { uk: ['попкорн'], de: ['Popcorn'], en: ['popcorn'] },
    stems: ['^попкорн', 'popcorn'] },
  { slug: 'ice-cream', categories: ['frozen', 'sweets-snacks'], names: { uk: ['морозиво'], de: ['Eis', 'Eiscreme'], en: ['ice cream'] },
    stems: ['^морозив', '^eis(?!\\p{L})', 'eiscreme', 'speiseeis', 'ice cream', 'gelato'] },

  // М'ясо
  { slug: 'meat', categories: ['meat', 'frozen'], names: { uk: ["м'ясо"], de: ['Fleisch'], en: ['meat'] } },
  { slug: 'chicken', parent: 'meat', categories: ['meat', 'frozen'], names: { uk: ['курятина', 'курка'], de: ['Hähnchen', 'Huhn'], en: ['chicken'] },
    stems: ['^кур(?:к(?!ум)|яч|ин|ч)', 'hahnchen', 'huhn', 'chicken'] },
  { slug: 'pork', parent: 'meat', categories: ['meat', 'frozen'], names: { uk: ['свинина'], de: ['Schweinefleisch'], en: ['pork'] },
    stems: ['^свин', 'schwein', '^pork'] },
  { slug: 'beef', parent: 'meat', categories: ['meat', 'frozen'], names: { uk: ['яловичина'], de: ['Rindfleisch'], en: ['beef'] },
    stems: ['^ялович', 'rindfleisch', 'rinder', '^rind(?!\\p{L})', 'beef'] },
  { slug: 'turkey', parent: 'meat', categories: ['meat', 'frozen'], names: { uk: ['індичка'], de: ['Pute', 'Truthahn'], en: ['turkey'] },
    stems: ['^індич', '^індик', '^pute', 'truthahn', 'turkey'] },
  { slug: 'minced-meat', parent: 'meat', categories: ['meat', 'frozen'], names: { uk: ['фарш'], de: ['Hackfleisch'], en: ['minced meat'] },
    stems: ['^фарш', 'hackfleisch', '^hack(?!\\p{L})', 'minced'] },
  { slug: 'sausages', categories: ['meat'], names: { uk: ['ковбасні вироби'], de: ['Wurstwaren', 'Aufschnitt'], en: ['sausages', 'cold cuts'] } },
  { slug: 'sausage', parent: 'sausages', categories: ['meat'], names: { uk: ['ковбаса', 'салямі'], de: ['Wurst', 'Salami'], en: ['sausage', 'salami'] },
    stems: ['^ковбас(?!к)', '^салям', 'wurst(?!chen)', 'salami'] },
  { slug: 'wieners', parent: 'sausages', categories: ['meat', 'frozen'], names: { uk: ['сосиски', 'сардельки'], de: ['Würstchen', 'Wiener'], en: ['wieners', 'frankfurters'] },
    stems: ['^сосиск', '^сардельк', '^ковбаск', 'wurstchen', 'wiener', 'frankfurter'] },
  { slug: 'ham', parent: 'sausages', categories: ['meat'], names: { uk: ['шинка', 'хамон'], de: ['Schinken'], en: ['ham'] },
    stems: ['^шинк', '^хамон', 'schinken', '^ham(?!\\p{L})', 'prosciutto', 'jamon'] },
  { slug: 'bacon', parent: 'sausages', categories: ['meat'], names: { uk: ['бекон'], de: ['Speck', 'Bacon'], en: ['bacon'] },
    stems: ['^бекон', 'bacon', 'speck'] },

  // Риба
  { slug: 'fish', categories: ['fish', 'frozen', 'pantry'], names: { uk: ['риба', 'морепродукти'], de: ['Fisch', 'Meeresfrüchte'], en: ['fish', 'seafood'] },
    stems: ['^риб(?!н)', '^морепродукт', '^fisch', 'meeresfrucht', 'seafood'] },
  { slug: 'salmon', parent: 'fish', categories: ['fish', 'frozen', 'pantry'], names: { uk: ['лосось', 'сьомга'], de: ['Lachs'], en: ['salmon'] },
    stems: ['^лосос', '^сьомг', '(?<!see)lachs', 'salmon'] },
  { slug: 'herring', parent: 'fish', categories: ['fish', 'frozen', 'pantry'], names: { uk: ['оселедець'], de: ['Hering'], en: ['herring'] },
    stems: ['^оселед', 'hering', 'matjes', 'herring'] },
  { slug: 'tuna', parent: 'fish', categories: ['fish', 'frozen', 'pantry'], names: { uk: ['тунець'], de: ['Thunfisch'], en: ['tuna'] },
    stems: ['^тун(?:ец|ц)', 'thunfisch', '^tuna'] },
  { slug: 'shrimp', parent: 'fish', categories: ['fish', 'frozen'], names: { uk: ['креветки'], de: ['Garnelen'], en: ['shrimp', 'prawns'] },
    stems: ['^кревет', 'garnele', 'shrimp', 'prawn'] },

  // Фрукти й овочі
  { slug: 'fruit', categories: ['fruit-veg', 'frozen'], names: { uk: ['фрукти'], de: ['Obst'], en: ['fruit'] } },
  { slug: 'apples', parent: 'fruit', categories: ['fruit-veg'], names: { uk: ['яблука'], de: ['Äpfel'], en: ['apples'] },
    stems: ['^яблук', '(?<!granat)apfel', '^apples?(?!\\p{L})'] },
  { slug: 'bananas', parent: 'fruit', categories: ['fruit-veg'], names: { uk: ['банани'], de: ['Bananen'], en: ['bananas'] },
    stems: ['^банан', 'banane', '^banana'] },
  { slug: 'oranges', parent: 'fruit', categories: ['fruit-veg'], names: { uk: ['апельсини'], de: ['Orangen'], en: ['oranges'] },
    stems: ['^апельсин', '^orangen?(?!\\p{L})'] },
  { slug: 'lemons', parent: 'fruit', categories: ['fruit-veg'], names: { uk: ['лимони'], de: ['Zitronen'], en: ['lemons'] },
    stems: ['^лимон(?!ад|н)', 'zitrone', '^lemons?(?!\\p{L})'] },
  { slug: 'vegetables', categories: ['fruit-veg', 'frozen'], names: { uk: ['овочі'], de: ['Gemüse'], en: ['vegetables'] } },
  { slug: 'potatoes', parent: 'vegetables', categories: ['fruit-veg', 'frozen'], names: { uk: ['картопля'], de: ['Kartoffeln'], en: ['potatoes'] },
    stems: ['^картопл', 'kartoffel', 'potato'] },
  { slug: 'tomatoes', parent: 'vegetables', categories: ['fruit-veg'], names: { uk: ['помідори', 'томати'], de: ['Tomaten'], en: ['tomatoes'] },
    stems: ['^томат', '^помідор', 'tomate', 'tomato'] },
  { slug: 'cucumbers', parent: 'vegetables', categories: ['fruit-veg'], names: { uk: ['огірки'], de: ['Gurken'], en: ['cucumbers'] },
    stems: ['^огір', 'gurke', 'cucumber'] },
  { slug: 'onions', parent: 'vegetables', categories: ['fruit-veg'], names: { uk: ['цибуля'], de: ['Zwiebeln'], en: ['onions'] },
    stems: ['^цибул', 'zwiebel', '^onions?(?!\\p{L})'] },
  { slug: 'carrots', parent: 'vegetables', categories: ['fruit-veg'], names: { uk: ['морква'], de: ['Karotten', 'Möhren'], en: ['carrots'] },
    stems: ['^моркв', 'karotte', 'mohre', 'carrot'] },

  // Бакалія
  { slug: 'pasta', categories: ['pantry'], names: { uk: ['макарони', 'макаронні вироби'], de: ['Nudeln', 'Pasta'], en: ['pasta'] },
    stems: ['^макарон', '^спагет', '^локшин', 'nudel', 'pasta', 'spaghetti', 'penne', 'fusilli', 'linguine'] },
  { slug: 'grains', categories: ['pantry'], names: { uk: ['крупи'], de: ['Getreide'], en: ['grains', 'cereals'] } },
  { slug: 'rice', parent: 'grains', categories: ['pantry'], names: { uk: ['рис'], de: ['Reis'], en: ['rice'] },
    stems: ['^рис(?!\\p{L})', 'reis(?!\\p{L})', '^rice'] },
  { slug: 'buckwheat', parent: 'grains', categories: ['pantry'], names: { uk: ['гречка'], de: ['Buchweizen'], en: ['buckwheat'] },
    stems: ['^греч', 'buchweizen', 'buckwheat'] },
  { slug: 'oats', parent: 'grains', categories: ['pantry'], names: { uk: ['вівсянка', 'вівсяні пластівці'], de: ['Haferflocken'], en: ['oats', 'oatmeal'] },
    stems: ['^вівс', 'hafer', '^oats?(?!\\p{L})', 'oatmeal', 'porridge'] },
  { slug: 'flour', categories: ['pantry'], names: { uk: ['борошно'], de: ['Mehl'], en: ['flour'] },
    stems: ['^борошн', 'mehl(?!wurm)', '^flour'] },
  { slug: 'sugar', categories: ['pantry'], names: { uk: ['цукор'], de: ['Zucker'], en: ['sugar'] },
    stems: ['^цукор', 'zucker(?!frei)', '^sugar'] },
  { slug: 'oil', categories: ['pantry'], names: { uk: ['олія'], de: ['Öl', 'Speiseöl'], en: ['oil'] },
    stems: ['^олі[яі]', '^ol(?!\\p{L})', 'olivenol', 'rapsol', 'blumenol', 'speiseol', '^oil(?!\\p{L})'] },

  // Напої
  { slug: 'soft-drinks', categories: ['drinks'], names: { uk: ['напої'], de: ['Getränke'], en: ['drinks', 'beverages'] } },
  { slug: 'water', parent: 'soft-drinks', categories: ['drinks'], names: { uk: ['вода'], de: ['Wasser', 'Mineralwasser'], en: ['water'] },
    stems: ['^вода(?!\\p{L})', 'wasser(?!kocher)', '^water'] },
  { slug: 'juice', parent: 'soft-drinks', categories: ['drinks'], names: { uk: ['сік', 'нектар'], de: ['Saft', 'Nektar'], en: ['juice'] },
    stems: ['^сік(?!\\p{L})', '^нектар(?!ин)', 'saft', 'nektar', 'juice'] },
  { slug: 'soda', parent: 'soft-drinks', categories: ['drinks'], names: { uk: ['газовані напої', 'лимонад'], de: ['Limonade', 'Softdrinks'], en: ['soda', 'soft drinks'] },
    stems: ['^лимонад', 'газован', '^кола(?!\\p{L})', 'limonade', '^cola(?!\\p{L})', '^soda'] },
  { slug: 'hot-drinks', categories: ['coffee-tea'], names: { uk: ['гарячі напої'], de: ['Heißgetränke'], en: ['hot drinks'] } },
  { slug: 'coffee', parent: 'hot-drinks', categories: ['coffee-tea'], names: { uk: ['кава'], de: ['Kaffee'], en: ['coffee'] },
    stems: ['^кав[аиуо](?!\\p{L})', '^кавов', 'kaffee', 'coffee', 'espresso', 'cappuccino', '^caffe'] },
  { slug: 'tea', parent: 'hot-drinks', categories: ['coffee-tea', 'drinks'], names: { uk: ['чай'], de: ['Tee'], en: ['tea'] },
    stems: ['^чаи(?!\\p{L})', '^чаю', 'tee(?!\\p{L})', '^tea(?!\\p{L})'] },
  { slug: 'cocoa', parent: 'hot-drinks', categories: ['coffee-tea'], names: { uk: ['какао'], de: ['Kakao'], en: ['cocoa'] },
    stems: ['^какао', 'kakao', 'cocoa'] },

  // Алкоголь
  { slug: 'alcohol', categories: ['alcohol'], names: { uk: ['алкоголь'], de: ['Alkohol', 'Spirituosen'], en: ['alcohol'] } },
  { slug: 'beer', parent: 'alcohol', categories: ['alcohol', 'drinks'], names: { uk: ['пиво'], de: ['Bier'], en: ['beer'] },
    stems: ['^пив[оаи]', 'bier', '^beers?(?!\\p{L})', 'radler', 'pils(?:ner)?(?!\\p{L})'] },
  { slug: 'wine', parent: 'alcohol', categories: ['alcohol', 'drinks'], names: { uk: ['вино'], de: ['Wein'], en: ['wine'] },
    stems: ['^вин[оа](?!\\p{L})', 'wein(?!gl|essig)', '^wine', 'riesling', 'sauvignon', 'merlot', 'chardonnay', 'cabernet', 'pinot', 'tempranillo'] },
  { slug: 'sparkling-wine', parent: 'alcohol', categories: ['alcohol', 'drinks'], names: { uk: ['ігристе вино', 'шампанське'], de: ['Sekt', 'Schaumwein'], en: ['sparkling wine', 'champagne'] },
    stems: ['^шампан', '^ігрист', '^вино ігрист', 'sekt', 'schaumwein', 'prosecco', 'champagne'] },
  { slug: 'vodka', parent: 'alcohol', categories: ['alcohol'], names: { uk: ['горілка'], de: ['Wodka'], en: ['vodka'] },
    stems: ['^горілк', '^водк', 'vodka', 'wodka'] },
  { slug: 'whisky', parent: 'alcohol', categories: ['alcohol'], names: { uk: ['віскі'], de: ['Whisky'], en: ['whisky', 'whiskey'] },
    stems: ['^віскі', 'whisk'] },
  { slug: 'rum', parent: 'alcohol', categories: ['alcohol'], names: { uk: ['ром'], de: ['Rum'], en: ['rum'] },
    stems: ['^ром(?:ов|\\P{L}|$)', '^rum(?!\\p{L})'] },
  { slug: 'brandy', parent: 'alcohol', categories: ['alcohol'], names: { uk: ['коньяк', 'бренді'], de: ['Weinbrand', 'Cognac'], en: ['brandy', 'cognac'] },
    stems: ['^коньяк', '^бренді', 'weinbrand', 'cognac', 'brandy'] },

  // Напівфабрикати
  { slug: 'dumplings', categories: ['frozen', 'ready-meals'], names: { uk: [], de: ['Teigtaschen'], en: ['dumplings'] } },
  { slug: 'varenyky', parent: 'dumplings', categories: ['frozen', 'ready-meals'], names: { uk: ['вареники'], de: ['Wareniki'], en: ['varenyky', 'pierogi'] },
    stems: ['^вареник', 'pierogi', 'wareniki'] },
  { slug: 'pelmeni', parent: 'dumplings', categories: ['frozen', 'ready-meals'], names: { uk: ['пельмені'], de: ['Pelmeni'], en: ['pelmeni'] },
    stems: ['^пельмен', 'pelmeni'] },
  { slug: 'pizza', categories: ['frozen', 'ready-meals'], names: { uk: ['піца'], de: ['Pizza'], en: ['pizza'] },
    stems: ['^піц', 'pizza'] },
];

const BY_SLUG = new Map(CONCEPTS.map((c) => [c.slug, c]));

const CYRILLIC = /\p{Script=Cyrillic}/u;

/** Після прийменника — начинка чи смак, не сам товар: "Біфштекс в беконі", "Joghurt mit Erdbeeren" */
const PREPOSITION =
  /(?<!\p{L})(?:з|зі|із|в|у|до|для|без|на|mit|in|auf|fur|ohne|weniger|with|without)(?!\p{L})/u;

/** "^" на початку основи — межа слова; \b у JS не бачить кирилиці */
const RULES = CONCEPTS.filter((c) => c.stems).map((c) => ({
  concept: c,
  rule: new RegExp(
    c.stems!.map((s) => s.replace(/^\^/, '(?<!\\p{L})')).join('|'),
    'gu',
  ),
}));

/**
 * Поняття товару за назвою. Українська назва починається з головного слова
 * ("Шоколад молочний" — шоколад), німецька й англійська ним закінчуються
 * ("Vollmilchschokolade", "Butterkekse"), тож перемагає перший збіг у кириличній назві
 * й останній — у латинській; за рівних — довший ("Knäckebrot" — хлібці, не хліб).
 * Слова після прийменника не враховуються.
 *
 * Відома категорія товару відкидає поняття інших категорій: "Milka Alpenmilch" у солодощах —
 * не молоко. Категорії мереж бувають хибні, тож кирилична назва, що починається з поняття
 * ("Молоко … безлактозне" у бакалії), лишає його.
 */
export function conceptOf(
  name: string,
  category?: CategorySlug | string | null,
): string | null {
  const text = fold(name).split(PREPOSITION)[0];
  const headFirst = CYRILLIC.test(name);
  const fits = bestMatch(text, headFirst, category);
  if (fits || !category || !headFirst) return fits?.slug ?? null;
  const head = bestMatch(text, headFirst, null);
  return head?.start === 0 ? head.slug : null;
}

function bestMatch(
  text: string,
  headFirst: boolean,
  category: string | null | undefined,
): { slug: string; start: number; end: number } | null {
  let best: { slug: string; start: number; end: number } | null = null;
  for (const { concept, rule } of RULES) {
    if (category && !concept.categories.includes(category as CategorySlug))
      continue;
    for (const m of text.matchAll(rule)) {
      const hit = {
        slug: concept.slug,
        start: m.index,
        end: m.index + m[0].length,
      };
      const better =
        !best ||
        (headFirst
          ? hit.start < best.start ||
            (hit.start === best.start && hit.end > best.end)
          : hit.end > best.end ||
            (hit.end === best.end && hit.start < best.start));
      if (better) best = hit;
    }
  }
  return best;
}

/** Поняття і всі його предки: bread → [bread, bakery] */
export function conceptPath(slug: string): string[] {
  const path: string[] = [];
  for (let c = BY_SLUG.get(slug); c; c = c.parent ? BY_SLUG.get(c.parent) : undefined)
    path.push(c.slug);
  return path;
}

const namesOf = (c: Concept) => [...c.names.uk, ...c.names.de, ...c.names.en];

/**
 * Слова для пошукового індексу: назви поняття та його предків усіма мовами (точний збіг)
 * і назви сусідів за батьком (споріднені, нижча вага): хліб → круасан, торт, кекс…
 */
export function conceptTerms(slug: string): { names: string[]; related: string[] } {
  const concept = BY_SLUG.get(slug);
  if (!concept) return { names: [], related: [] };
  return {
    names: conceptPath(slug).flatMap((s) => namesOf(BY_SLUG.get(s)!)),
    related: concept.parent
      ? CONCEPTS.filter((c) => c.parent === concept.parent && c !== concept).flatMap(namesOf)
      : [],
  };
}

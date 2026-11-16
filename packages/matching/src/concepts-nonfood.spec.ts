import { CONCEPTS, conceptOf, conceptPath, queryConcept } from './concepts';
import { fold } from './normalization/text';

// Назви — з каталогу (Auchan, Metro, Novus, ALDI, Lidl, Kaufland): категорія як у БД

describe('conceptOf: побутова хімія', () => {
  it.each([
    [
      'Капсули для прання Fine Life Universal',
      'household',
      'laundry-detergent',
    ],
    [
      'Гель для прання Dada для дитячого одягу',
      'household',
      'laundry-detergent',
    ],
    ['Пральний порошок Savex Premium Fresh', 'household', 'laundry-detergent'],
    [
      'Засіб для прання Woolite Mix Colors для кольорових тканин з кератином',
      'household',
      'laundry-detergent',
    ],
    ['Universal-Waschmittel Gel, flüssig', 'household', 'laundry-detergent'],
    ['Color-Waschmittel Pods MaxPower', 'household', 'laundry-detergent'],
    ['Feinwaschmittel Pflege', 'household', 'laundry-detergent'],
    [
      'Кондиціонер для білизни Lenor Пробудження весни',
      'household',
      'fabric-softener',
    ],
    ['Ополіскувач для білизни Sapfir Flory', 'household', 'fabric-softener'],
    ['Weichspüler Fresh Control, Cool Fresh', 'household', 'fabric-softener'],
    ['Засіб для миття посуду Frosch Малина', 'household', 'dishwashing'],
    [
      'Гель для миття посуду Donat Clean Nature Харчова сода',
      'household',
      'dishwashing',
    ],
    [
      'Geschirrspülmittel Ultra Plus Konzentrat, Original',
      'household',
      'dishwashing',
    ],
    [
      'Spülmaschinen-Tabs Powerball Ultimate Fresh',
      'household',
      'dishwasher-tablets',
    ],
    [
      'Засіб універсальний Auchan для чищення різних поверхонь',
      'household',
      'surface-cleaner',
    ],
    [
      'Засіб чистячий Chanteclair для ванної кімнати',
      'household',
      'surface-cleaner',
    ],
    [
      "Порошок для чищення Sila універсальний Лайма та м'ята",
      'household',
      'surface-cleaner',
    ],
    ['Bodenreiniger, Pavimenti', 'household', 'surface-cleaner'],
    [
      'Блок для унітазу Domestos Power 5 Крижана магнолія',
      'household',
      'toilet-cleaner',
    ],
    ['Засіб для чищення унітазу Ref', 'household', 'toilet-cleaner'],
    [
      'Засіб для прочищення зливних труб Oniks Krot',
      'household',
      'drain-cleaner',
    ],
    ['Rohrreiniger Granulat', 'household', 'drain-cleaner'],
    [
      'Освіжувач повітря рідкий Areon Sport Lux Gold',
      'household',
      'air-freshener',
    ],
    [
      'Балон змінний аерозольний Glade One Півонія і соковиті ягоди',
      'household',
      'air-freshener',
    ],
    [
      'Duftstecker Nachfüller, Cotton & Weiße Orchidee',
      'household',
      'air-freshener',
    ],
    ['Свічка Festa цифра 7 кольорова', 'other', 'candle'],
    ['Stumpenkerze, hellgrün, 80/150 mm', 'household', 'candle'],
    ['Губки кухонні Aro стандартні', 'household', 'sponge'],
    ['Putzschwamm Herbst, Ahorn', 'household', 'sponge'],
    [
      'Швабра для підлоги Vileda Easy Mop губчаста з віджимом',
      'household',
      'mop',
    ],
    [
      'Насадка для швабри Eco Fabric з мікрофібри з абразивними вставками 43см',
      'household',
      'mop',
    ],
    ['Пакети для сміття Solar', 'household', 'garbage-bags'],
    ['Müllbeutel mit Zugband', 'household', 'garbage-bags'],
    ['Рукавички господарські Fino Aloe Vera латексні S', 'household', 'gloves'],
    ['Рідина від комарів IreX 60 ночей', 'household', 'insect-control'],
    [
      'Плямовивідник Vanish для кольорових тканин',
      'household',
      'stain-remover',
    ],
    ['Йоржик для унітазу Elephant', 'household', 'cleaning-brush'],
    ['Туалетний папір Ruta Selecta 3-шаровий', 'beauty', 'toilet-paper'],
    ['Toilettenpapier', 'household', 'toilet-paper'],
    ['Рушники паперові Mildi салатові 100м', 'household', 'paper-towels'],
    ['Küchentücher Recycling', 'household', 'paper-towels'],
    ['Серветки Ruta Філіжанки 2-шарові 33*33см', 'household', 'napkins'],
    ['Cocktail-Servietten 25x25cm Lovely Stars', 'household', 'napkins'],
    ['Хустинки носові Selpak Стандарт 4-х шарові', 'beauty', 'tissues'],
    ['Taschentücher natural & soft', 'beauty', 'tissues'],
    [
      'Серветки вологі господарчі Vortex універсальні',
      'household',
      'wet-wipes',
    ],
    ['Lithium Knopfbatterie CR1220', 'other', 'batteries'],
    ['Лампочка Eurolamp LED E27 10W 4000K', 'household', 'light-bulb'],
    ['Каструля Krauff зі скляною кришкою', 'other', 'cookware'],
    ['Edelstahl-Pfanne »Wabenstruktur«', 'household', 'cookware'],
    ['Тарілка Orion Серце десертна 20,5см в асортименті', 'other', 'tableware'],
    ['Виделки Novus пластикові жовті', 'other', 'cutlery'],
    ['Springform Rechteck 35x25cm', 'household', 'bakeware'],
    [
      'Пергамент для випічки Metro Professional 29см 50м',
      'household',
      'bakeware',
    ],
    ['Aufbewahrungsbox Löwe 33x33x33cm', 'household', 'storage'],
    ['Фольга Fino алюмінієва 50м', 'other', 'foil-wrap'],
    ['Харчова плівка Фрекен Бок Max 100 м', 'household', 'foil-wrap'],
  ])('%s → %s', (name, category, slug) => {
    expect(conceptOf(name, category)).toBe(slug);
  });
});

describe('conceptOf: краса й гігієна', () => {
  it.each([
    ['Шампунь Head&Shoulders Цитрусова свіжість 2-в-1', 'beauty', 'shampoo'],
    [
      'Фито-шампунь Viva Oliva Відновлюючий з оливковою і аргановою олією',
      'beauty',
      'shampoo',
    ],
    ['Gliss Kur Haarshampoo, Aqua Revive', 'beauty', 'shampoo'],
    [
      'Бальзам-ополіскувач Pantene Pro-V Active Nutri-Plex Аква лайт',
      'beauty',
      'hair-conditioner',
    ],
    [
      'Кондиціонер для волосся Sansi Profi Balance Prebiotic Balancing',
      'beauty',
      'hair-conditioner',
    ],
    ['Elvital Haarspülung, Total Repair 5', 'beauty', 'hair-conditioner'],
    [
      'Фарба для волосся Garnier Color Naturals 5.34 Карамельний шоколад',
      'beauty',
      'hair-dye',
    ],
    ['Brillance Haarfarbe, Blau-Schwarz 891', 'beauty', 'hair-dye'],
    [
      'Віск для волосся Taft Creative Looks Фіксація 5',
      'beauty',
      'hair-styling',
    ],
    [
      'Лак для волосся Elise з мультивітамінами та UV-фільтром',
      'beauty',
      'hair-styling',
    ],
    ['Haarspray, Flexible Hold', 'beauty', 'hair-styling'],
    ['Гель для душу Palmolive Олія для тіла Ожина', 'beauty', 'shower-gel'],
    ['Крем-гель для душу Fa Coconut Milk', 'beauty', 'shower-gel'],
    ['Duschgel, Men Active Clean 3in1', 'beauty', 'shower-gel'],
    ['Pflegedusche Men 3in1, Energie', 'beauty', 'shower-gel'],
    ['Мило рідке Vidal Арганова олія', 'beauty', 'soap'],
    ['Крем-мило «Повна Чаша»® Оливка рідке дой-пак', 'beauty', 'soap'],
    [
      'Flüssige Handseife No Touch Nachfüller, Brombeere & Waldfrucht',
      'beauty',
      'soap',
    ],
    ['Schaumbad, Sehnsucht nach Wald', 'beauty', 'bath-products'],
    [
      'Антиперспірант кульковий Fa Men Sport Energy Boost',
      'beauty',
      'deodorant',
    ],
    ['Дезодорант твердий Old Spice Wolfthorn', 'beauty', 'deodorant'],
    ['Deo Creme Whole Body, Ocean Rush', 'beauty', 'deodorant'],
    [
      'Зубна паста Sensodyne Пронамель Дбайливе Вибілювання',
      'beauty',
      'toothpaste',
    ],
    ['Fluorid Zahncreme', 'beauty', 'toothpaste'],
    ["Зубна щітка Oral-B Junior 6+ м'якої жорсткості", 'beauty', 'toothbrush'],
    ['Elektrische Zahnbürste iO5, Quite White', 'beauty', 'toothbrush'],
    ['Mundspülung, Super Clean', 'beauty', 'dental-care'],
    ['Зубна нитка Melica Wax&Mint 50 м', 'beauty', 'dental-care'],
    [
      "Крем для обличчя L'Oreal Paris Вік експерт 55+ нічний",
      'beauty',
      'face-care',
    ],
    ['Nachtcreme Olivenöl & Panthenol', 'beauty', 'face-care'],
    [
      'Ліфтинг-маска для обличчя Hollyskin охолоджувальна проти набряків',
      'beauty',
      'face-mask',
    ],
    ['Tuchmaske Rainbow Leopard', 'beauty', 'face-mask'],
    ['Міцелярна вода Simple Kind to Skin', 'beauty', 'skin-cleansing'],
    [
      'Sanfter Augen Make-Up Entferner, für die sensible Augenpartie',
      'beauty',
      'skin-cleansing',
    ],
    ['Крем для тіла Byphasse Зволожувальний', 'beauty', 'body-care'],
    ['Bodylotion Cherry Vanilla', 'beauty', 'body-care'],
    [
      'Крем для рук Nivea Зволоження і догляд з оливковою олією',
      'beauty',
      'hand-foot-care',
    ],
    ['Handcreme Working Hands, Intensive Pflege', 'beauty', 'hand-foot-care'],
    ['Fußbalsam, Totes Meer, Intensiv', 'beauty', 'hand-foot-care'],
    [
      'Спрей сонцезахисний Nivea Sun Protect & Moisture SPF30',
      'beauty',
      'sun-care',
    ],
    ['Sonnencreme Gesicht LSF 30', 'beauty', 'sun-care'],
    ['Бритви одноразові жіночі Gillette Simply Venus 3', 'beauty', 'shaving'],
    [
      'Касети змінні для гоління Bic Hybrid 3 Flex чоловічі',
      'beauty',
      'shaving',
    ],
    ['Men Rasiergel Sensitive', 'beauty', 'shaving'],
    ['After Shave 1881 Pour Homme', 'beauty', 'shaving'],
    [
      'Lippenstift Superstay Ink Crayon, KNow no Limits 115',
      'beauty',
      'makeup',
    ],
    ['Perfect Duo XXL Mascara', 'beauty', 'makeup'],
    [
      'Diamond Treasures Cream to Powder Eyeshadow 030 Smokey Diamond',
      'beauty',
      'makeup',
    ],
    ['Nagellack 50 Set in Stone', 'beauty', 'nails'],
    ['Profi-Nagelfeile Nr. 60-18', 'beauty', 'nails'],
    ['Eau de Toilette, For Her', 'beauty', 'perfume'],
    [
      'Прокладки гігієнічні Naturella Maxi Camomile',
      'beauty',
      'feminine-hygiene',
    ],
    [
      'Тампони Tampax Compak Regular з аплікатором',
      'beauty',
      'feminine-hygiene',
    ],
    ['Ватні палички Salve', 'beauty', 'cotton'],
    ['Бальзам для губ Mayur Super Men для чоловіків', 'beauty', 'lip-care'],
    ['Haargummi schwarz, gedreht', 'beauty', 'hair-accessories'],
    [
      'Презервативи Durex Classic латексні з силіконовою змазкою',
      'beauty',
      'condoms',
    ],
    ['Pflaster, Sensitive Kids, 20 Strips', 'beauty', 'plasters'],
    ['Ashwagandha Kapseln', 'beauty', 'supplements'],
    ['Добавка дієтична NOVEL Волосся, шкіра та нігті', 'beauty', 'supplements'],
    ['Magnesium Complex', 'beauty', 'supplements'],
  ])('%s → %s', (name, category, slug) => {
    expect(conceptOf(name, category)).toBe(slug);
  });
});

describe('conceptOf: тварини', () => {
  it.each([
    [
      'Вологий корм PURINA ONE Sterilcat для дорослих котів шматочки в соусі з індичкою',
      'pets',
      'cat-food',
    ],
    [
      'Корм сухий Brit Premium з ягням для стерилізованих котів',
      'pets',
      'cat-food',
    ],
    [
      'Суп Delickcious з курки з шинкою та додаванням шпинату для котів',
      'pets',
      'cat-food',
    ],
    [
      'Katzen-Nassfutter Felix, So gut wie es aussieht, Kaninchen in Gelee',
      'pets',
      'cat-food',
    ],
    ['Friskies Katzennassfutter', 'pets', 'cat-food'],
    [
      'Корм для собак Optimeal з лососем та лохиною в крем соусі',
      'pets',
      'dog-food',
    ],
    [
      'Корм вологий Friskies з яловичиною та картоплею для дорослих собак',
      'pets',
      'dog-food',
    ],
    [
      'Hunde-Nassfutter Hardys Traum, No. 1 Sensitive, Rind',
      'pets',
      'dog-food',
    ],
    ['Hunde-Trockenfutter, Pferd/Süßkartoffel', 'pets', 'dog-food'],
    ['Корм для хвилястих папуг Topsi Просо', 'pets', 'bird-food'],
    ['Vogelfutter Kräcker, Mandel + Feige', 'pets', 'bird-food'],
    [
      'Корм для донних риб Природа Біовіт Сомики гранульований',
      'pets',
      'fish-food',
    ],
    ['Fisch-Futter Phyll, Flocken', 'pets', 'fish-food'],
    [
      'Корм для дрібних гризунів Topsi Фруктово-овочеве меню',
      'pets',
      'small-animal-food',
    ],
    ['Kaninchenfutter Vita Life, Wellness', 'pets', 'small-animal-food'],
    ['Pferde Ergänzungsfutter, Broncho Plus', 'pets', 'pet-food'],
    [
      'Ласощі для собак Pedigree Denta Stix кістка для чищення зубів',
      'pets',
      'pet-treats',
    ],
    ['Knuspertaschen / Dreamies, Katzenminze', 'pets', 'pet-treats'],
    ['Hunde-Snack Fleischstreifen, Lamm', 'pets', 'pet-treats'],
    [
      'Наповнювач гігієнічний Happy Nova для котів силікагелевий',
      'pets',
      'cat-litter',
    ],
    ['Katzenstreu Öko', 'pets', 'cat-litter'],
    ['Іграшка для котів Trixie Мишка з кетніпу 5см', 'pets', 'pet-toys'],
    ["Дражнилка Cats Collection М'яч для кота", 'pets', 'pet-toys'],
    ['Hundespielzeug Spielball mit Noppen, ca. 12cm', 'pets', 'pet-toys'],
    [
      'Повідець Waudog Nylon нейлоновий L-XXL 122см/15мм з малюнком леопард',
      'pets',
      'pet-accessories',
    ],
    ['Halsband Lima für Hunde 25mm x 36-45cm', 'pets', 'pet-accessories'],
    ['Transportbox Expedion, Creme/Rot', 'pets', 'pet-accessories'],
    [
      'Шампунь для собак Trixie з олією макадамії та обліпихи',
      'pets',
      'pet-care',
    ],
    ['Hundeshampoo Jojobaöl', 'pets', 'pet-care'],
  ])('%s → %s', (name, category, slug) => {
    expect(conceptOf(name, category)).toBe(slug);
  });
});

describe('conceptOf: діти', () => {
  it.each([
    [
      'Підгузки-трусики Huggies Little Movers 6 для хлопчиків 15',
      'baby',
      'diapers',
    ],
    ['Windeln Baby Dry Gr.4 Maxi 9-, XXL-Pack', 'baby', 'diapers'],
    [
      'Суміш молочна суха Малютка Преміум 4 для дітей з 18 місяців',
      'baby',
      'baby-formula',
    ],
    ['Milumil Anfangsmilch, Pre', 'baby', 'baby-formula'],
    ['Пюре Hipp Овочі та локшина з тріскою', 'baby', 'baby-food'],
    [
      'Babynahrung Apfel-Birne mit Dinkelgrieß, ab 6. Monat',
      'baby',
      'baby-food',
    ],
    [
      'Пустушка Canpol Babies анатомічна силікон 6-18 міс Night Dreams',
      'baby',
      'pacifiers',
    ],
    ['Schnuller Original Start Night 0-2', 'baby', 'pacifiers'],
    [
      'Пляшечка Lovi Trends повільний потік 3+ міс бежевий',
      'baby',
      'baby-feeding',
    ],
    ['Тарілка Baby Team на присосці', 'baby', 'baby-feeding'],
    ['Серветки вологі Huggies Natural Care', 'baby', 'wet-wipes'],
    ['Крем-мило дитяче Dr.Mama Дбайливе очищення календула', 'baby', 'soap'],
    [
      'Конструктор Lego Friends День народження кота і будинок на дереві 42666',
      'baby',
      'construction-toys',
    ],
    [
      'LEGO Harry Potter Schloss Hogwarts: Zauberkunstunterricht 76442',
      'other',
      'construction-toys',
    ],
    [
      'Лялька L.O.L. Surprise! Loves Strawberry Shortcake Шарлота-Суничка та друзі',
      'baby',
      'dolls',
    ],
    [
      'Пазл Dodo Paw Patrol Герої Бухти пригод 4-6-8 8 елементів',
      'baby',
      'puzzles',
    ],
    ['Гра настільна Голодні черепашки арт.25MT0001', 'baby', 'board-games'],
    ['Kartenspiel Werwölfe Vollmondnacht', 'other', 'board-games'],
    ["Іграшка м'яка MicroZoo Носоріг суматранський 9см", 'baby', 'plush-toys'],
    ['Набір для творчості Zhorya Створи прикраси', 'baby', 'crafts'],
    ['Іграшка One Two Fun Міні-машинка в асортименті', 'baby', 'toys'],
  ])('%s → %s', (name, category, slug) => {
    expect(conceptOf(name, category)).toBe(slug);
  });
});

describe('непродуктові поняття не чіпають їжу', () => {
  it.each([
    // кириличний збіг на початку не переносить непродуктове поняття в харчову категорію
    ['Пюре Auchan яблучне без цукру', 'pantry', null],
    ['Вата цукрова Tasty Lasty зі смаком банана', 'sweets-snacks', null],
    ['Суп Hokkaido Club Фо Бо', 'pantry', null],
    ['Berliner / Pfannkuchen', null, null],
    ['Pfannengemüse', 'frozen', null],
    ['Handcreme, parfümfrei Urea', 'beauty', 'hand-foot-care'],
    ['Körpercreme, Vitamin E & Aloe Vera', 'beauty', 'body-care'],
    ['Lip Conditioner, Aloe Vera/Traubenkern/Olivenöl', 'beauty', 'lip-care'],
    ['Kfz-Batterieladegerät »MPLGD 5.0 D2«', 'other', null],
    ['Aschesauger »PAS 20«', null, null],
    [
      'Корм для собак Pedigree Mini з птицею та овочами для малих порід',
      'pets',
      'dog-food',
    ],
    [
      'Корм вологий Gourmet Perle Duo з океанічною рибою та тунцем для котів',
      'pets',
      'cat-food',
    ],
    // харчові поняття лишаються у своїх категоріях
    ['Молоко Галичина 2,5%', 'dairy-eggs', 'milk'],
    ['Шоколад молочний Millennium Golden Nut', 'sweets-snacks', 'chocolate'],
    ['Kaffeekapseln Crema', 'coffee-tea', 'coffee'],
  ])('%s → %s', (name, category, slug) => {
    expect(conceptOf(name, category)).toBe(slug);
  });
});

describe('queryConcept: непродуктові запити', () => {
  it.each([
    ['пральний порошок', 'laundry-detergent'],
    ['Waschmittel', 'laundry-detergent'],
    ['засіб для миття посуду', 'dishwashing'],
    ['Spülmittel', 'dishwashing'],
    ['туалетний папір', 'toilet-paper'],
    ['toilet paper', 'toilet-paper'],
    ['шампунь', 'shampoo'],
    ['shampoo', 'shampoo'],
    ['зубна паста', 'toothpaste'],
    ['Zahnpasta', 'toothpaste'],
    ['дезодорант', 'deodorant'],
    ['deo', 'deodorant'],
    ['гель для душу', 'shower-gel'],
    ['Duschgel', 'shower-gel'],
    ['мило', 'soap'],
    ['Seife', 'soap'],
    ['підгузки', 'diapers'],
    ['Windeln', 'diapers'],
    ['diapers', 'diapers'],
    ['вологі серветки', 'wet-wipes'],
    ['Feuchttücher', 'wet-wipes'],
    ['корм для котів', 'cat-food'],
    ['Katzenfutter', 'cat-food'],
    ['cat food', 'cat-food'],
    ['корм для собак', 'dog-food'],
    ['Hundefutter', 'dog-food'],
    ['наповнювач для котів', 'cat-litter'],
    ['Katzenstreu', 'cat-litter'],
    ['конструктор', 'construction-toys'],
    ['lego', 'construction-toys'],
    ['побутова хімія', 'cleaning'],
    ['корм для кішок', 'cat-food'],
    ['корм Purina для котів', 'cat-food'],
  ])('%s → %s', (query, slug) => {
    expect(queryConcept(query)).toBe(slug);
  });

  it('харчові запити не змінились', () => {
    expect(queryConcept('молоко')).toBe('milk');
    expect(queryConcept('Mineralwasser')).toBe('water');
    expect(queryConcept('Nudeln')).toBe('pasta');
    expect(queryConcept('кава мелена')).toBe('coffee');
    expect(queryConcept('масло вершкове')).toBe('butter');
    expect(queryConcept('чай')).toBe('tea');
    expect(queryConcept('Eistee')).toBe('tea');
  });
});

describe('довідник непродуктових понять', () => {
  it('назви понять не повторюються між поняттями', () => {
    const seen = new Map<string, string>();
    for (const c of CONCEPTS)
      for (const name of [...c.names.uk, ...c.names.de, ...c.names.en]) {
        const key = fold(name);
        if (seen.has(key) && seen.get(key) !== c.slug)
          throw new Error(`«${name}»: ${seen.get(key)} і ${c.slug}`);
        seen.set(key, c.slug);
      }
  });

  it('основи й вирази компілюються і не містять незгорнутих літер', () => {
    for (const c of CONCEPTS)
      for (const s of [...(c.stems ?? []), ...(c.phrases ?? [])])
        expect(s).not.toMatch(/[йї]/);
  });

  it('предки', () => {
    expect(conceptPath('cat-food')).toEqual(['cat-food', 'pet-food', 'pets']);
    expect(conceptPath('laundry-detergent')).toEqual([
      'laundry-detergent',
      'cleaning',
    ]);
  });
});

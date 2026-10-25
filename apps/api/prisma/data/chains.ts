// Реєстр продуктових мереж: ті, що парсяться, і кандидати на розширення.
// Людський опис і джерела — docs/04-retail-chains.md, аудит robots.txt — docs/01-data-sources.md.
// Ключ (slug) збігається з назвою парсера в apps/scraper/src/sources/mod.rs.
// Кандидат (CANDIDATE) ще не перевірений: перед парсером — robots.txt, чесний UA, антибот, умови.

export type ChainStatus = 'ACTIVE' | 'PAUSED' | 'CANDIDATE' | 'RULED_OUT';
export type OnlinePrices = 'FULL' | 'PARTIAL' | 'UNKNOWN';

export interface ChainSeed {
  slug: string;
  name: string;
  countryCode: string;
  website: string;
  status: ChainStatus;
  onlinePrices: OnlinePrices;
  notes?: string;
  /** Пауза між запитами, мс (не менше Crawl-delay з robots.txt) */
  crawlDelayMs?: number;
  /** Обходити щодня після цієї години UTC (мережі лише з акціями — нові стартують зранку) */
  scrapeHourUtc?: number;
  /** Інші написання бренду в OpenStreetMap (теги brand/name), якщо не збігаються з name */
  osmBrands?: string[];
}

/** 04:00 UTC = 05:00–06:00 у Німеччині: акції дня вже опубліковані, магазини відкриваються */
const OFFERS_DAILY_UTC = 4;

const F = 'FULL' as const;
const P = 'PARTIAL' as const;
const U = 'UNKNOWN' as const;

/** Кандидати однієї країни: [slug, назва, сайт, ціни онлайн, примітка?] */
function candidates(
  countryCode: string,
  rows: [string, string, string, OnlinePrices, string?][],
  status: ChainStatus = 'CANDIDATE',
): ChainSeed[] {
  return rows.map(([slug, name, website, onlinePrices, notes]) => ({
    slug,
    name,
    countryCode,
    website,
    status,
    onlinePrices,
    notes,
  }));
}

const RULED_OUT_ANTIBOT =
  'Антибот-захист блокує чесного бота (403 / challenge) — не обходимо';

export const CHAINS: ChainSeed[] = [
  // ============ Парсяться (ACTIVE) і з парсером, але вимкнені (PAUSED) ============
  {
    slug: 'silpo',
    name: 'Сільпо',
    countryCode: 'UA',
    website: 'https://silpo.ua',
    status: 'ACTIVE',
    onlinePrices: F,
    notes: 'З 12.10.2026 за Cloudflare; при 403 — вимкнути, не обходити',
  },
  {
    slug: 'novus',
    name: 'NOVUS',
    countryCode: 'UA',
    website: 'https://novus.zakaz.ua',
    status: 'ACTIVE',
    onlinePrices: F,
  },
  {
    slug: 'auchan',
    name: 'Ашан',
    countryCode: 'UA',
    website: 'https://auchan.zakaz.ua',
    status: 'ACTIVE',
    onlinePrices: F,
    notes: 'auchan.ua за Cloudflare — беремо вітрину zakaz.ua',
  },
  {
    slug: 'metro-ua',
    name: 'METRO',
    countryCode: 'UA',
    website: 'https://metro.zakaz.ua',
    status: 'ACTIVE',
    onlinePrices: F,
  },
  {
    slug: 'eko',
    name: 'ЕКО маркет',
    countryCode: 'UA',
    website: 'https://eko.zakaz.ua',
    status: 'ACTIVE',
    onlinePrices: F,
  },
  {
    slug: 'megamarket',
    name: 'МегаМаркет',
    countryCode: 'UA',
    website: 'https://megamarket.zakaz.ua',
    status: 'ACTIVE',
    onlinePrices: F,
  },
  {
    slug: 'varus',
    name: 'VARUS',
    countryCode: 'UA',
    website: 'https://varus.ua',
    status: 'ACTIVE',
    onlinePrices: F,
  },
  {
    slug: 'atb',
    name: 'АТБ',
    countryCode: 'UA',
    website: 'https://www.atbmarket.com',
    status: 'PAUSED',
    onlinePrices: F,
    notes: 'Парсер готовий; сайт на технічних роботах (жовтень 2026)',
  },
  {
    slug: 'aldi-sued',
    name: 'ALDI SÜD',
    countryCode: 'DE',
    website: 'https://www.aldi-sued.de',
    status: 'ACTIVE',
    onlinePrices: F,
  },
  {
    slug: 'aldi-nord',
    name: 'ALDI Nord',
    countryCode: 'DE',
    website: 'https://www.aldi-nord.de',
    status: 'ACTIVE',
    onlinePrices: F,
  },
  {
    slug: 'globus-de',
    name: 'Globus',
    countryCode: 'DE',
    website: 'https://produkte.globus.de',
    status: 'ACTIVE',
    onlinePrices: F,
  },
  {
    slug: 'lidl-de',
    name: 'Lidl',
    countryCode: 'DE',
    website: 'https://www.lidl.de',
    status: 'ACTIVE',
    onlinePrices: P,
    notes: 'Продуктових цін онлайн немає — дані з Open Prices (ODbL)',
  },
  {
    slug: 'kaufland-de',
    name: 'Kaufland',
    countryCode: 'DE',
    website: 'https://filiale.kaufland.de',
    status: 'ACTIVE',
    onlinePrices: P,
    notes: 'Лише щотижневі акції',
    scrapeHourUtc: OFFERS_DAILY_UTC,
  },
  {
    slug: 'penny-de',
    name: 'PENNY',
    countryCode: 'DE',
    website: 'https://www.penny.de',
    status: 'ACTIVE',
    onlinePrices: P,
    notes: 'Лише щотижневі акції',
    scrapeHourUtc: OFFERS_DAILY_UTC,
  },
  {
    slug: 'norma-de',
    name: 'NORMA',
    countryCode: 'DE',
    website: 'https://www.norma-online.de',
    status: 'ACTIVE',
    onlinePrices: P,
    notes: 'Лише щотижневі акції',
    scrapeHourUtc: OFFERS_DAILY_UTC,
  },

  // ============ Україна ============
  ...candidates('UA', [
    ['fozzy', 'Fozzy', 'https://fozzyshop.ua', F],
    [
      'tavria-v',
      'Таврія В',
      'https://www.tavriav.ua',
      U,
      'robots.txt → 403 (S3) — уточнити вручну',
    ],
    ['nash-krai', 'Наш Край', 'https://nashkraj.ua', P],
    ['rukavychka', 'Рукавичка', 'https://market.rukavychka.ua', F],
    ['spar-ua', 'SPAR Україна', 'https://spar.ua', P],
    ['kopiyka', 'Копійка', 'https://kopiyka.ua', P],
    ['blyzenko', 'Близенько', 'https://blyzenko.ua', P],
    ['sim23', 'Сім23', 'https://sim23.ua', P],
    ['thrash', 'Траш', 'https://thrash.ua', P],
    ['velmart', 'Велмарт', 'https://velmart.ua', F],
    ['kolos', 'Колос', 'https://kolos.ua', U],
    [
      'prostor',
      'Prostor',
      'https://prostor.ua',
      P,
      'Disallow */catalog/* (Magento)',
    ],
    [
      'watsons-ua',
      'Watsons',
      'https://watsons.ua',
      P,
      'Пагінація заборонена — лише sitemap',
    ],
    ['avrora', 'Аврора', 'https://avrora.ua', P],
  ]),
  ...candidates(
    'UA',
    [
      [
        'fora',
        'Фора',
        'https://fora.ua',
        F,
        'React без SSR, дані лише з окремого API',
      ],
      ['eva', 'EVA', 'https://eva.ua', F, RULED_OUT_ANTIBOT],
      [
        'rozetka',
        'Rozetka',
        'https://rozetka.com.ua',
        F,
        'Cloudflare challenge — маркетплейс',
      ],
      [
        'glovo-ua',
        'Glovo',
        'https://glovoapp.com',
        F,
        'CloudFront 403, сервіс доставки',
      ],
    ],
    'RULED_OUT',
  ),

  // ============ Німеччина ============
  ...candidates(
    'DE',
    [
      ['rewe-de', 'REWE', 'https://www.rewe.de', F, RULED_OUT_ANTIBOT],
      [
        'netto-md-de',
        'Netto Marken-Discount',
        'https://www.netto-online.de',
        F,
        RULED_OUT_ANTIBOT,
      ],
      ['dm-de', 'dm', 'https://www.dm.de', F, 'API товарів закрите robots.txt'],
      ['rossmann-de', 'Rossmann', 'https://www.rossmann.de', F, 'JS-челендж'],
      [
        'edeka-de',
        'EDEKA',
        'https://www.edeka.de',
        P,
        'Акції окремо для кожного маркету, загальної ціни мережі немає',
      ],
      [
        'picnic-de',
        'Picnic',
        'https://picnic.app',
        F,
        'Ціни лише в застосунку після входу',
      ],
      [
        'kaufland-marketplace-de',
        'Kaufland.de (маркетплейс)',
        'https://www.kaufland.de',
        F,
        'Cloudflare captcha',
      ],
    ],
    'RULED_OUT',
  ),
  ...candidates('DE', [
    ['edeka24-de', 'edeka24', 'https://www.edeka24.de', F, 'Crawl-delay 20 с'],
    ['netto-de', 'NETTO (Salling)', 'https://www.netto.de', P],
    ['mueller-de', 'Müller', 'https://www.mueller.de', F],
    ['tegut-de', 'tegut', 'https://www.tegut.com', F],
    ['flink-de', 'Flink', 'https://www.goflink.com', F],
    ['knuspr-de', 'Knuspr', 'https://www.knuspr.de', F],
    ['famila-de', 'famila', 'https://www.famila-nordost.de', P],
    ['combi-de', 'combi', 'https://www.combi.de', P],
    ['hit-de', 'HIT', 'https://www.hit.de', P],
    ['v-markt-de', 'V-Markt', 'https://www.v-markt.de', P],
    ['marktkauf-de', 'Marktkauf', 'https://www.marktkauf.de', P],
  ]),

  // ============ Польща ============
  ...candidates('PL', [
    ['biedronka-pl', 'Biedronka', 'https://www.biedronka.pl', P],
    ['lidl-pl', 'Lidl Polska', 'https://www.lidl.pl', P],
    ['zabka-pl', 'Żabka', 'https://www.zabka.pl', P],
    ['kaufland-pl', 'Kaufland Polska', 'https://www.kaufland.pl', P],
    ['auchan-pl', 'Auchan Polska', 'https://www.auchan.pl', F],
    ['carrefour-pl', 'Carrefour Polska', 'https://www.carrefour.pl', F],
    ['netto-pl', 'Netto Polska', 'https://www.netto.pl', P],
    ['dino-pl', 'Dino', 'https://grupadino.pl', U],
    ['stokrotka-pl', 'Stokrotka', 'https://www.stokrotka.pl', F],
    ['frisco-pl', 'Frisco', 'https://www.frisco.pl', F],
    ['rossmann-pl', 'Rossmann Polska', 'https://www.rossmann.pl', F],
    ['hebe-pl', 'Hebe', 'https://www.hebe.pl', F],
    ['polomarket-pl', 'Polomarket', 'https://www.polomarket.pl', U],
    ['intermarche-pl', 'Intermarché Polska', 'https://intermarche.pl', U],
    ['topaz-pl', 'Topaz', 'https://www.topaz24.pl', U],
    ['lewiatan-pl', 'Lewiatan', 'https://www.lewiatan.pl', U],
  ]),

  // ============ Чехія, Словаччина ============
  ...candidates('CZ', [
    ['albert-cz', 'Albert', 'https://www.albert.cz', P],
    ['billa-cz', 'Billa', 'https://www.billa.cz', F],
    ['penny-cz', 'Penny', 'https://www.penny.cz', P],
    ['tesco-cz', 'Tesco', 'https://nakup.itesco.cz', F],
    ['kaufland-cz', 'Kaufland', 'https://www.kaufland.cz', P],
    ['lidl-cz', 'Lidl', 'https://www.lidl.cz', P],
    ['globus-cz', 'Globus', 'https://www.globus.cz', F],
    ['rohlik-cz', 'Rohlik.cz', 'https://www.rohlik.cz', F],
  ]),
  ...candidates('SK', [
    ['billa-sk', 'Billa', 'https://www.billa.sk', F],
    ['tesco-sk', 'Tesco', 'https://potravinydomov.itesco.sk', F],
    ['lidl-sk', 'Lidl', 'https://www.lidl.sk', P],
    ['kaufland-sk', 'Kaufland', 'https://www.kaufland.sk', P],
    ['coop-jednota-sk', 'COOP Jednota', 'https://www.coop.sk', U],
    ['terno-sk', 'Terno', 'https://www.terno.sk', U],
    ['fresh-sk', 'Fresh', 'https://www.freshplus.sk', U],
  ]),

  // ============ Австрія, Швейцарія ============
  ...candidates('AT', [
    ['billa-at', 'BILLA', 'https://shop.billa.at', F],
    ['spar-at', 'SPAR', 'https://www.spar.at', F],
    ['hofer-at', 'Hofer (ALDI SÜD)', 'https://www.hofer.at', F],
    ['lidl-at', 'Lidl Österreich', 'https://www.lidl.at', P],
    ['penny-at', 'Penny', 'https://www.penny.at', P],
    ['mpreis-at', 'MPREIS', 'https://www.mpreis.at', U],
    ['unimarkt-at', 'Unimarkt', 'https://www.unimarkt.at', U],
  ]),
  ...candidates('CH', [
    ['migros-ch', 'Migros', 'https://www.migros.ch', F],
    ['coop-ch', 'Coop', 'https://www.coop.ch', F],
    ['denner-ch', 'Denner', 'https://www.denner.ch', F],
    ['aldi-ch', 'ALDI SUISSE', 'https://www.aldi-suisse.ch', F],
    ['lidl-ch', 'Lidl Schweiz', 'https://www.lidl.ch', P],
    ['volg-ch', 'Volg', 'https://www.volg.ch', U],
    ['manor-ch', 'Manor Food', 'https://www.manor.ch', U],
  ]),

  // ============ Франція, Бенілюкс ============
  ...candidates('FR', [
    ['carrefour-fr', 'Carrefour', 'https://www.carrefour.fr', F],
    ['leclerc-fr', 'E.Leclerc', 'https://www.e.leclerc', F],
    ['intermarche-fr', 'Intermarché', 'https://www.intermarche.com', F],
    ['auchan-fr', 'Auchan', 'https://www.auchan.fr', F],
    ['systeme-u-fr', 'Système U', 'https://www.coursesu.com', F],
    ['monoprix-fr', 'Monoprix', 'https://www.monoprix.fr', F],
    ['franprix-fr', 'Franprix', 'https://www.franprix.fr', F],
    ['casino-fr', 'Casino', 'https://www.casino.fr', F],
    ['lidl-fr', 'Lidl France', 'https://www.lidl.fr', P],
    ['aldi-fr', 'ALDI France', 'https://www.aldi.fr', P],
    ['grand-frais-fr', 'Grand Frais', 'https://www.grandfrais.com', U],
    ['picard-fr', 'Picard', 'https://www.picard.fr', F],
  ]),
  ...candidates('BE', [
    ['carrefour-be', 'Carrefour', 'https://www.carrefour.be', F],
    ['colruyt-be', 'Colruyt', 'https://www.colruyt.be', F],
    ['delhaize-be', 'Delhaize', 'https://www.delhaize.be', F],
    ['ah-be', 'Albert Heijn', 'https://www.ah.be', F],
    ['jumbo-be', 'Jumbo', 'https://www.jumbo.com', F],
    ['intermarche-be', 'Intermarché', 'https://www.intermarche.be', U],
  ]),
  ...candidates('NL', [
    ['ah-nl', 'Albert Heijn', 'https://www.ah.nl', F],
    ['jumbo-nl', 'Jumbo', 'https://www.jumbo.com', F],
    ['plus-nl', 'Plus', 'https://www.plus.nl', F],
    ['dirk-nl', 'Dirk', 'https://www.dirk.nl', F],
    ['dekamarkt-nl', 'DekaMarkt', 'https://www.dekamarkt.nl', F],
    ['vomar-nl', 'Vomar', 'https://www.vomar.nl', F],
    ['hoogvliet-nl', 'Hoogvliet', 'https://www.hoogvliet.com', F],
    ['coop-nl', 'Coop', 'https://www.coop.nl', F],
    ['aldi-nl', 'ALDI', 'https://www.aldi.nl', P],
    ['lidl-nl', 'Lidl', 'https://www.lidl.nl', P],
  ]),
  ...candidates('LU', [['cactus-lu', 'Cactus', 'https://www.cactus.lu', F]]),

  // ============ Велика Британія, Ірландія ============
  ...candidates('GB', [
    ['tesco-gb', 'Tesco', 'https://www.tesco.com', F],
    ['sainsburys-gb', "Sainsbury's", 'https://www.sainsburys.co.uk', F],
    ['asda-gb', 'Asda', 'https://www.asda.com', F],
    ['morrisons-gb', 'Morrisons', 'https://groceries.morrisons.com', F],
    ['waitrose-gb', 'Waitrose', 'https://www.waitrose.com', F],
    ['ocado-gb', 'Ocado', 'https://www.ocado.com', F],
    ['iceland-gb', 'Iceland', 'https://www.iceland.co.uk', F],
    ['coop-gb', 'Co-op', 'https://www.coop.co.uk', P],
    ['aldi-gb', 'ALDI UK', 'https://www.aldi.co.uk', F],
    ['lidl-gb', 'Lidl GB', 'https://www.lidl.co.uk', P],
    ['ms-gb', 'M&S Food', 'https://www.marksandspencer.com', P],
    ['boots-gb', 'Boots', 'https://www.boots.com', F],
    ['superdrug-gb', 'Superdrug', 'https://www.superdrug.com', F],
  ]),
  ...candidates('IE', [
    ['dunnes-ie', 'Dunnes Stores', 'https://www.dunnesstoresgrocery.com', F],
    ['supervalu-ie', 'SuperValu', 'https://shop.supervalu.ie', F],
    ['tesco-ie', 'Tesco Ireland', 'https://www.tesco.ie', F],
  ]),

  // ============ Південна Європа ============
  ...candidates('ES', [
    ['mercadona-es', 'Mercadona', 'https://tienda.mercadona.es', F],
    ['carrefour-es', 'Carrefour España', 'https://www.carrefour.es', F],
    ['dia-es', 'Dia', 'https://www.dia.es', F],
    ['eroski-es', 'Eroski', 'https://supermercado.eroski.es', F],
    ['alcampo-es', 'Alcampo', 'https://www.compraonline.alcampo.es', F],
    ['consum-es', 'Consum', 'https://tienda.consum.es', F],
    ['lidl-es', 'Lidl España', 'https://www.lidl.es', P],
    ['aldi-es', 'ALDI España', 'https://www.aldi.es', P],
    [
      'el-corte-ingles-es',
      'El Corte Inglés',
      'https://www.elcorteingles.es',
      F,
    ],
  ]),
  ...candidates('PT', [
    ['continente-pt', 'Continente', 'https://www.continente.pt', F],
    ['pingo-doce-pt', 'Pingo Doce', 'https://www.pingodoce.pt', P],
    ['auchan-pt', 'Auchan Portugal', 'https://www.auchan.pt', F],
    [
      'intermarche-pt',
      'Intermarché Portugal',
      'https://lojaonline.intermarche.pt',
      F,
    ],
    ['lidl-pt', 'Lidl Portugal', 'https://www.lidl.pt', P],
    ['minipreco-pt', 'Minipreço', 'https://www.minipreco.pt', P],
  ]),
  ...candidates('IT', [
    ['esselunga-it', 'Esselunga', 'https://www.esselunga.it', F],
    ['coop-it', 'Coop Italia', 'https://www.e-coop.it', F],
    ['conad-it', 'Conad', 'https://www.conad.it', F],
    ['carrefour-it', 'Carrefour Italia', 'https://www.carrefour.it', F],
    ['eurospin-it', 'Eurospin', 'https://www.eurospin.it', P],
    ['lidl-it', 'Lidl Italia', 'https://www.lidl.it', P],
    ['md-it', 'MD', 'https://www.mdspa.it', P],
    ['penny-it', 'Penny Italia', 'https://www.penny.it', P],
    ['pam-it', 'Pam', 'https://www.pampanorama.it', P],
    ['despar-it', 'Despar', 'https://www.despar.it', P],
    ['bennet-it', 'Bennet', 'https://www.bennet.com', P],
    ['iper-it', 'Iper', 'https://www.iper.it', P],
  ]),
  ...candidates('GR', [
    ['sklavenitis-gr', 'Sklavenitis', 'https://www.sklavenitis.gr', F],
    ['ab-gr', 'AB Vassilopoulos', 'https://www.ab.gr', F],
    ['masoutis-gr', 'Masoutis', 'https://www.masoutis.gr', F],
    ['mymarket-gr', 'My Market', 'https://www.mymarket.gr', F],
    ['lidl-gr', 'Lidl Hellas', 'https://www.lidl-hellas.gr', P],
  ]),
  ...candidates('HR', [
    [
      'konzum-hr',
      'Konzum',
      'https://www.konzum.hr',
      F,
      'Мережі зобовʼязані публікувати прайси — відкриті файли',
    ],
    [
      'plodine-hr',
      'Plodine',
      'https://www.plodine.hr',
      F,
      'Обовʼязкові відкриті прайси',
    ],
    [
      'tommy-hr',
      'Tommy',
      'https://www.tommy.hr',
      F,
      'Обовʼязкові відкриті прайси',
    ],
    [
      'studenac-hr',
      'Studenac',
      'https://www.studenac.hr',
      F,
      'Обовʼязкові відкриті прайси',
    ],
  ]),
  ...candidates('SI', [
    ['mercator-si', 'Mercator', 'https://www.mercator.si', F],
    ['tus-si', 'Tuš', 'https://www.tus.si', F],
  ]),
  ...candidates('RS', [
    ['maxi-rs', 'Maxi', 'https://www.maxi.rs', F],
    ['idea-rs', 'Idea', 'https://www.idea.rs', F],
  ]),
  ...candidates('BG', [
    ['kaufland-bg', 'Kaufland', 'https://www.kaufland.bg', P],
    ['lidl-bg', 'Lidl', 'https://www.lidl.bg', P],
    ['fantastico-bg', 'Fantastico', 'https://www.fantastico.bg', P],
    ['billa-bg', 'Billa', 'https://www.billa.bg', P],
  ]),
  ...candidates('RO', [
    ['mega-image-ro', 'Mega Image', 'https://www.mega-image.ro', F],
    ['carrefour-ro', 'Carrefour România', 'https://carrefour.ro', F],
    ['kaufland-ro', 'Kaufland', 'https://www.kaufland.ro', P],
    ['profi-ro', 'Profi', 'https://www.profi.ro', P],
    ['auchan-ro', 'Auchan România', 'https://www.auchan.ro', F],
    ['penny-ro', 'Penny', 'https://www.penny.ro', P],
  ]),
  ...candidates('HU', [
    ['tesco-hu', 'Tesco', 'https://bevasarlas.tesco.hu', F],
    ['spar-hu', 'SPAR', 'https://www.spar.hu', P],
    ['auchan-hu', 'Auchan', 'https://online.auchan.hu', F],
    ['cba-hu', 'CBA', 'https://www.cba.hu', P],
    ['penny-hu', 'Penny', 'https://www.penny.hu', P],
  ]),

  // ============ Північна Європа, Балтія ============
  ...candidates('SE', [
    ['ica-se', 'ICA', 'https://www.ica.se', F],
    ['coop-se', 'Coop', 'https://www.coop.se', F],
    ['willys-se', 'Willys', 'https://www.willys.se', F],
    ['hemkop-se', 'Hemköp', 'https://www.hemkop.se', F],
    ['lidl-se', 'Lidl', 'https://www.lidl.se', P],
  ]),
  ...candidates('NO', [
    [
      'rema-1000-no',
      'Rema 1000',
      'https://www.rema.no',
      F,
      'Агрегатор Kassalapp (API з ключем)',
    ],
    ['kiwi-no', 'Kiwi', 'https://kiwi.no', F, 'Агрегатор Kassalapp'],
    ['meny-no', 'Meny', 'https://meny.no', F, 'Агрегатор Kassalapp'],
    ['coop-no', 'Coop', 'https://coop.no', F, 'Агрегатор Kassalapp'],
    ['extra-no', 'Extra', 'https://coop.no/extra', F, 'Агрегатор Kassalapp'],
  ]),
  ...candidates('DK', [
    ['netto-dk', 'Netto', 'https://netto.dk', F],
    ['fotex-dk', 'Føtex', 'https://www.foetex.dk', F],
    ['bilka-dk', 'Bilka', 'https://www.bilka.dk', F],
    ['rema-1000-dk', 'Rema 1000', 'https://rema1000.dk', F],
    ['coop-dk', 'Coop', 'https://coop.dk', F],
    ['lidl-dk', 'Lidl', 'https://www.lidl.dk', P],
  ]),
  ...candidates('FI', [
    ['k-ruoka-fi', 'K-Market / K-Citymarket', 'https://www.k-ruoka.fi', F],
    ['s-kaupat-fi', 'S-Market / Prisma', 'https://www.s-kaupat.fi', F],
    ['lidl-fi', 'Lidl', 'https://www.lidl.fi', P],
  ]),
  ...candidates('EE', [
    ['rimi-ee', 'Rimi', 'https://www.rimi.ee', F],
    ['prisma-ee', 'Prisma', 'https://www.prismamarket.ee', F],
    ['selver-ee', 'Selver', 'https://www.selver.ee', F],
    ['coop-ee', 'Coop Eesti', 'https://www.coop.ee', F],
    ['maxima-ee', 'Maxima', 'https://www.maxima.ee', F],
  ]),
  ...candidates('LV', [
    ['rimi-lv', 'Rimi', 'https://www.rimi.lv', F],
    ['maxima-lv', 'Maxima', 'https://www.maxima.lv', F],
  ]),
  ...candidates('LT', [
    ['rimi-lt', 'Rimi', 'https://www.rimi.lt', F],
    ['maxima-lt', 'Maxima (Barbora)', 'https://www.barbora.lt', F],
    ['iki-lt', 'Iki', 'https://www.iki.lt', P],
    ['norfa-lt', 'Norfa', 'https://www.norfa.lt', P],
    ['lidl-lt', 'Lidl', 'https://www.lidl.lt', P],
  ]),

  // ============ Інші країни Європи ============
  ...candidates('MD', [
    ['linella-md', 'Linella', 'https://linella.md', U],
    ['nr1-md', 'Nr.1', 'https://nr1.md', U],
    ['kaufland-md', 'Kaufland', 'https://www.kaufland.md', U],
  ]),
  ...candidates('TR', [
    ['migros-tr', 'Migros', 'https://www.migros.com.tr', F],
    ['bim-tr', 'BİM', 'https://www.bim.com.tr', P],
    ['a101-tr', 'A101', 'https://www.a101.com.tr', F],
    ['sok-tr', 'ŞOK', 'https://www.sokmarket.com.tr', F],
    ['carrefoursa-tr', 'CarrefourSA', 'https://www.carrefoursa.com', F],
  ]),
  ...candidates(
    'BY',
    [
      ['euroopt-by', 'Евроопт', 'https://evroopt.by', U, 'Санкційні ризики'],
      ['gippo-by', 'Гиппо', 'https://gippo-market.by', U, 'Санкційні ризики'],
    ],
    'RULED_OUT',
  ),
  ...candidates(
    'RU',
    [
      [
        'magnit-ru',
        'Магнит',
        'https://magnit.ru',
        U,
        'Санкції, етичні причини',
      ],
      [
        'pyaterochka-ru',
        'Пятёрочка',
        'https://5ka.ru',
        U,
        'Санкції, етичні причини',
      ],
      [
        'perekrestok-ru',
        'Перекрёсток',
        'https://www.perekrestok.ru',
        U,
        'Санкції, етичні причини',
      ],
    ],
    'RULED_OUT',
  ),

  // ============ США, Канада ============
  ...candidates('US', [
    [
      'walmart-us',
      'Walmart',
      'https://www.walmart.com',
      F,
      'Сильний антибот-захист — перевірити',
    ],
    [
      'kroger-us',
      'Kroger',
      'https://www.kroger.com',
      F,
      'Ціни конкретного магазину',
    ],
    ['costco-us', 'Costco', 'https://www.costco.com', F],
    ['target-us', 'Target', 'https://www.target.com', F],
    ['albertsons-us', 'Albertsons / Safeway', 'https://www.safeway.com', F],
    ['publix-us', 'Publix', 'https://www.publix.com', F],
    ['heb-us', 'H-E-B', 'https://www.heb.com', F],
    ['food-lion-us', 'Food Lion', 'https://www.foodlion.com', F],
    ['stop-shop-us', 'Stop & Shop', 'https://stopandshop.com', F],
    ['aldi-us', 'ALDI US', 'https://www.aldi.us', F],
    ['lidl-us', 'Lidl US', 'https://www.lidl.com', F],
    ['trader-joes-us', "Trader Joe's", 'https://www.traderjoes.com', P],
    ['whole-foods-us', 'Whole Foods', 'https://www.wholefoodsmarket.com', F],
    ['amazon-fresh-us', 'Amazon Fresh', 'https://www.amazon.com', F, 'Антибот'],
    ['wegmans-us', 'Wegmans', 'https://www.wegmans.com', F],
    ['meijer-us', 'Meijer', 'https://www.meijer.com', F],
    ['hy-vee-us', 'Hy-Vee', 'https://www.hy-vee.com', F],
    ['sprouts-us', 'Sprouts', 'https://www.sprouts.com', F],
    ['winco-us', 'WinCo', 'https://www.wincofoods.com', F],
    ['giant-eagle-us', 'Giant Eagle', 'https://www.gianteagle.com', F],
    ['shoprite-us', 'ShopRite', 'https://www.shoprite.com', F],
    ['dollar-general-us', 'Dollar General', 'https://www.dollargeneral.com', P],
    ['dollar-tree-us', 'Dollar Tree', 'https://www.dollartree.com', P],
    ['cvs-us', 'CVS', 'https://www.cvs.com', F],
    ['walgreens-us', 'Walgreens', 'https://www.walgreens.com', F],
    [
      'instacart-us',
      'Instacart',
      'https://www.instacart.com',
      F,
      'Агрегатор багатьох мереж, потрібен вхід',
    ],
  ]),
  ...candidates('CA', [
    ['loblaws-ca', 'Loblaws', 'https://www.loblaws.ca', F],
    ['no-frills-ca', 'No Frills', 'https://www.nofrills.ca', F],
    [
      'superstore-ca',
      'Real Canadian Superstore',
      'https://www.realcanadiansuperstore.ca',
      F,
    ],
    ['sobeys-ca', 'Sobeys', 'https://www.sobeys.com', F],
    ['metro-ca', 'Metro', 'https://www.metro.ca', F],
    ['walmart-ca', 'Walmart Canada', 'https://www.walmart.ca', F],
    ['costco-ca', 'Costco Canada', 'https://www.costco.ca', F],
    ['save-on-foods-ca', 'Save-On-Foods', 'https://www.saveonfoods.com', F],
    ['giant-tiger-ca', 'Giant Tiger', 'https://www.gianttiger.com', F],
  ]),

  // ============ Латинська Америка ============
  ...candidates('MX', [
    ['walmart-mx', 'Walmart México', 'https://super.walmart.com.mx', F],
    ['soriana-mx', 'Soriana', 'https://www.soriana.com', F],
    ['chedraui-mx', 'Chedraui', 'https://www.chedraui.com.mx', F],
    ['la-comer-mx', 'La Comer', 'https://www.lacomer.com.mx', F],
    ['oxxo-mx', 'OXXO', 'https://www.oxxo.com', P],
  ]),
  ...candidates('BR', [
    ['carrefour-br', 'Carrefour Brasil', 'https://mercado.carrefour.com.br', F],
    ['atacadao-br', 'Atacadão', 'https://www.atacadao.com.br', F],
    ['assai-br', 'Assaí', 'https://www.assai.com.br', F],
    ['pao-de-acucar-br', 'Pão de Açúcar', 'https://www.paodeacucar.com', F],
    [
      'supermercados-bh-br',
      'Supermercados BH',
      'https://www.supermercadosbh.com.br',
      F,
    ],
    ['zaffari-br', 'Zaffari', 'https://www.zaffari.com.br', F],
  ]),
  ...candidates('AR', [
    ['coto-ar', 'Coto', 'https://www.cotodigital3.com.ar', F],
    ['carrefour-ar', 'Carrefour Argentina', 'https://www.carrefour.com.ar', F],
    ['jumbo-ar', 'Jumbo', 'https://www.jumbo.com.ar', F],
    ['disco-ar', 'Disco', 'https://www.disco.com.ar', F],
    ['dia-ar', 'Día', 'https://diaonline.supermercadosdia.com.ar', F],
  ]),
  ...candidates('CL', [
    ['lider-cl', 'Lider', 'https://www.lider.cl', F],
    ['jumbo-cl', 'Jumbo', 'https://www.jumbo.cl', F],
    ['unimarc-cl', 'Unimarc', 'https://www.unimarc.cl', F],
    ['tottus-cl', 'Tottus', 'https://www.tottus.cl', F],
    ['santa-isabel-cl', 'Santa Isabel', 'https://www.santaisabel.cl', F],
  ]),
  ...candidates('CO', [
    ['exito-co', 'Éxito', 'https://www.exito.com', F],
    ['olimpica-co', 'Olímpica', 'https://www.olimpica.com', F],
    ['d1-co', 'D1', 'https://domicilios.tiendasd1.com', P],
    ['ara-co', 'Ara', 'https://aratiendas.com', P],
  ]),
  ...candidates('PE', [
    ['plaza-vea-pe', 'Plaza Vea', 'https://www.plazavea.com.pe', F],
    ['tottus-pe', 'Tottus', 'https://www.tottus.com.pe', F],
    ['wong-pe', 'Wong', 'https://www.wong.pe', F],
    ['metro-pe', 'Metro', 'https://www.metro.pe', F],
  ]),
  ...candidates('UY', [
    [
      'tienda-inglesa-uy',
      'Tienda Inglesa',
      'https://www.tiendainglesa.com.uy',
      F,
    ],
    ['disco-uy', 'Disco', 'https://www.disco.com.uy', F],
  ]),

  // ============ Японія ============
  ...candidates('JP', [
    ['aeon-jp', 'AEON', 'https://www.aeonnetshop.com', F],
    ['ito-yokado-jp', 'Ito-Yokado', 'https://www.itoyokado.co.jp', F],
    ['seven-eleven-jp', '7-Eleven Japan', 'https://www.sej.co.jp', P],
    ['familymart-jp', 'FamilyMart', 'https://www.family.co.jp', P],
    ['lawson-jp', 'Lawson', 'https://www.lawson.co.jp', P],
    ['life-jp', 'Life', 'https://www.lifecorp.jp', F],
    ['seiyu-jp', 'Seiyu', 'https://www.seiyu.co.jp', F],
    ['gyomu-super-jp', 'Gyomu Super', 'https://www.gyomusuper.jp', P],
    ['don-quijote-jp', 'Don Quijote', 'https://www.donki.com', P],
    ['ok-store-jp', 'OK Store', 'https://ok-corporation.jp', P],
    ['summit-jp', 'Summit', 'https://www.summitstore.co.jp', P],
    ['maruetsu-jp', 'Maruetsu', 'https://www.maruetsu.co.jp', P],
    ['york-benimaru-jp', 'York-Benimaru', 'https://www.yorkbeni.co.jp', P],
    [
      'matsukiyo-jp',
      'Matsumoto Kiyoshi',
      'https://www.matsukiyococokara-online.com',
      F,
    ],
    ['welcia-jp', 'Welcia', 'https://www.welcia.co.jp', F],
    ['tsuruha-jp', 'Tsuruha', 'https://www.tsuruha.co.jp', F],
  ]),

  // ============ Азія ============
  ...candidates('KR', [
    ['emart-kr', 'E-mart', 'https://emart.ssg.com', F],
    ['lotte-mart-kr', 'Lotte Mart', 'https://www.lottemart.com', F],
    ['homeplus-kr', 'Homeplus', 'https://front.homeplus.co.kr', F],
    ['gs25-kr', 'GS25', 'https://gs25.gsretail.com', P],
    ['cu-kr', 'CU', 'https://cu.bgfretail.com', P],
    ['coupang-kr', 'Coupang', 'https://www.coupang.com', F],
  ]),
  ...candidates('CN', [
    [
      'hema-cn',
      'Hema (Freshippo)',
      'https://www.freshhema.com',
      F,
      'Переважно в застосунку',
    ],
    ['yonghui-cn', 'Yonghui', 'https://www.yonghui.com.cn', P],
    ['rt-mart-cn', 'RT-Mart', 'https://www.rt-mart.com.cn', P],
    ['walmart-cn', 'Walmart China', 'https://www.walmart.cn', P],
    ['jd-cn', 'JD.com', 'https://www.jd.com', F],
  ]),
  ...candidates('TW', [
    ['pxmart-tw', 'PX Mart', 'https://www.pxmart.com.tw', P],
    ['carrefour-tw', 'Carrefour Taiwan', 'https://online.carrefour.com.tw', F],
    ['familymart-tw', 'FamilyMart Taiwan', 'https://www.family.com.tw', P],
    ['seven-eleven-tw', '7-Eleven Taiwan', 'https://www.7-11.com.tw', P],
  ]),
  ...candidates('HK', [
    ['parknshop-hk', 'PARKnSHOP', 'https://www.parknshop.com', F],
    ['wellcome-hk', 'Wellcome', 'https://www.wellcome.com.hk', F],
    ['aeon-hk', 'AEON Hong Kong', 'https://www.aeonstores.com.hk', F],
  ]),
  ...candidates('SG', [
    ['fairprice-sg', 'FairPrice', 'https://www.fairprice.com.sg', F],
    ['cold-storage-sg', 'Cold Storage', 'https://coldstorage.com.sg', F],
    ['giant-sg', 'Giant Singapore', 'https://giant.sg', F],
    ['sheng-siong-sg', 'Sheng Siong', 'https://shengsiong.com.sg', F],
  ]),
  ...candidates('TH', [
    ['lotuss-th', "Lotus's", 'https://www.lotuss.com', F],
    ['big-c-th', 'Big C', 'https://www.bigc.co.th', F],
    ['tops-th', 'Tops', 'https://www.tops.co.th', F],
    ['makro-th', 'Makro', 'https://www.makro.pro', F],
    ['seven-eleven-th', '7-Eleven Thailand', 'https://www.7eleven.co.th', P],
  ]),
  ...candidates('MY', [
    ['giant-my', 'Giant Malaysia', 'https://www.giant.com.my', F],
    ['lotuss-my', "Lotus's Malaysia", 'https://www.lotuss.com.my', F],
    ['aeon-my', 'AEON Malaysia', 'https://www.aeonretail.com.my', F],
    ['mydin-my', 'Mydin', 'https://www.mydin.com.my', P],
    ['99-speedmart-my', '99 Speedmart', 'https://www.99speedmart.com.my', P],
  ]),
  ...candidates('ID', [
    ['alfamart-id', 'Alfamart', 'https://alfagift.id', F],
    ['indomaret-id', 'Indomaret', 'https://www.klikindomaret.com', F],
    ['hypermart-id', 'Hypermart', 'https://www.hypermart.co.id', P],
    ['transmart-id', 'Transmart', 'https://www.transmart.co.id', P],
  ]),
  ...candidates('PH', [
    ['sm-supermarket-ph', 'SM Supermarket', 'https://smmarkets.ph', F],
    ['puregold-ph', 'Puregold', 'https://puregold.com.ph', F],
    [
      'robinsons-ph',
      'Robinsons Supermarket',
      'https://www.robinsonssupermarket.com.ph',
      F,
    ],
  ]),
  ...candidates('VN', [
    ['winmart-vn', 'WinMart', 'https://winmart.vn', F],
    ['coopmart-vn', 'Co.opmart', 'https://cooponline.vn', F],
    ['bach-hoa-xanh-vn', 'Bách Hóa Xanh', 'https://www.bachhoaxanh.com', F],
    ['lotte-mart-vn', 'Lotte Mart Vietnam', 'https://www.lottemart.vn', F],
  ]),
  ...candidates('IN', [
    ['jiomart-in', 'JioMart', 'https://www.jiomart.com', F],
    ['dmart-in', 'DMart', 'https://www.dmart.in', F],
    ['bigbasket-in', 'BigBasket', 'https://www.bigbasket.com', F],
    ['spencers-in', "Spencer's", 'https://www.spencers.in', F],
    ['more-in', 'More', 'https://www.moreretail.in', F],
    ['blinkit-in', 'Blinkit', 'https://blinkit.com', F],
    ['zepto-in', 'Zepto', 'https://www.zeptonow.com', F],
  ]),
  ...candidates('AE', [
    ['carrefour-ae', 'Carrefour UAE', 'https://www.carrefouruae.com', F],
    ['lulu-ae', 'Lulu', 'https://www.luluhypermarket.com', F],
    ['spinneys-ae', 'Spinneys', 'https://www.spinneys.com', F],
  ]),
  ...candidates('SA', [
    ['panda-sa', 'Panda', 'https://www.panda.com.sa', F],
    ['tamimi-sa', 'Tamimi Markets', 'https://shop.tamimimarkets.com', F],
  ]),
  ...candidates('IL', [
    [
      'shufersal-il',
      'Shufersal',
      'https://www.shufersal.co.il',
      F,
      'Закон про прозорість цін: мережі публікують XML-прайси',
    ],
    [
      'rami-levy-il',
      'Rami Levy',
      'https://www.rami-levy.co.il',
      F,
      'XML-прайси за законом',
    ],
    [
      'victory-il',
      'Victory',
      'https://www.victoryonline.co.il',
      F,
      'XML-прайси за законом',
    ],
  ]),

  // ============ Океанія, Африка ============
  ...candidates('AU', [
    ['woolworths-au', 'Woolworths', 'https://www.woolworths.com.au', F],
    ['coles-au', 'Coles', 'https://www.coles.com.au', F],
    ['aldi-au', 'ALDI Australia', 'https://www.aldi.com.au', F],
    ['iga-au', 'IGA', 'https://www.iga.com.au', P],
  ]),
  ...candidates('NZ', [
    ['woolworths-nz', 'Woolworths NZ', 'https://www.woolworths.co.nz', F],
    ['new-world-nz', 'New World', 'https://www.newworld.co.nz', F],
    ['paknsave-nz', "Pak'nSave", 'https://www.paknsave.co.nz', F],
  ]),
  ...candidates('ZA', [
    ['shoprite-za', 'Shoprite', 'https://www.shoprite.co.za', F],
    ['checkers-za', 'Checkers', 'https://www.checkers.co.za', F],
    ['pick-n-pay-za', 'Pick n Pay', 'https://www.pnp.co.za', F],
    ['woolworths-za', 'Woolworths SA', 'https://www.woolworths.co.za', F],
    ['spar-za', 'SPAR South Africa', 'https://www.spar.co.za', P],
  ]),
  ...candidates('EG', [
    ['carrefour-eg', 'Carrefour Egypt', 'https://www.carrefouregypt.com', F],
  ]),
  ...candidates('MA', [
    ['carrefour-ma', 'Carrefour Maroc', 'https://www.carrefour.ma', F],
    ['marjane-ma', 'Marjane', 'https://www.marjane.ma', F],
  ]),
];

# Мережі магазинів для майбутнього розширення

Це **перелік кандидатів**, а не план на найближчі етапи. Зараз у роботі 14 мереж України та Німеччини ([01-data-sources.md](01-data-sources.md)). Мета на майбутнє — охопити відомі й менш відомі продуктові мережі Європи, Америки, Японії та Азії, щоб система знала, скільки коштує той самий товар (і його варіації) у кожній країні.

> **Жодну мережу з цього списку ще не перевірено.** Перед написанням парсера для кожної треба пройти ту саму процедуру, що й для поточних ([01-data-sources.md](01-data-sources.md#правила-поведінки-нашого-парсера)): robots.txt, відповідь на чесний User-Agent `OnniMartBot`, наявність цін онлайн (SSR/JSON у сторінці), антибот-захист, умови користування. Мережі за Cloudflare-челенджем, captcha чи логіном **не обходимо**.

Колонка «Онлайн-ціни» — попереднє очікування з відкритих джерел: ✅ є онлайн-магазин або каталог з цінами; 🟡 лише листівки/акції або ціни залежать від магазину; ❓ невідомо. Домени наведено орієнтовно.

## Пріоритети розширення

1. **Мережі з онлайн-каталогом і штрихкодами в даних.** Вони дають еталон для зіставлення між країнами.
2. **Міжнародні мережі в кількох країнах** (ALDI, Lidl, Kaufland, Carrefour, Auchan, SPAR, Tesco, Ahold Delhaize, Rewe Group, Schwarz Group, AEON, 7-Eleven). Той самий асортимент власних марок дає природні пари для порівняння цін між країнами.
3. **Агрегатори та відкриті дані** (Open Prices, державні реєстри цін, наприклад Franceagrimer, Ціни.ua, Kassalapp у Норвегії, офіційні бази цін у Хорватії, Португалії та Греції). Вони замінюють сотні окремих парсерів.

---

## Європа

### Україна (розширення поточного списку)

| Мережа | Домен | Тип | Онлайн-ціни |
|---|---|---|---|
| АТБ | atbmarket.com | дискаунтер | ✅ (парсер готовий, сайт був на техроботах) |
| Фора | fora.ua | супермаркет | ✅ (React без SSR, потрібне API) |
| Fozzy | fozzyshop.ua | гіпермаркет / cash&carry | ✅ |
| Таврія В | tavriav.ua | супермаркет | ❓ |
| Наш Край | nashkraj.ua | супермаркет | 🟡 |
| Рукавичка | market.rukavychka.ua | супермаркет (Захід) | ✅ |
| SPAR Україна | spar.ua | супермаркет | 🟡 |
| Копійка | kopiyka.ua | дискаунтер | 🟡 |
| Близенько | blyzenko.ua | магазини біля дому | 🟡 |
| Сім23 | sim23.ua | магазини біля дому | 🟡 |
| Thrash! (Траш) | thrash.ua | дискаунтер | 🟡 |
| Велмарт | velmart.ua | супермаркет | ✅ |
| Колос | kolos.ua | супермаркет | ❓ |
| ЕКО маркет, МегаМаркет, NOVUS, Ашан, METRO, VARUS, Сільпо | — | **вже парсяться** | ✅ |
| EVA, Prostor, Watsons | eva.ua, prostor.ua, watsons.ua | дрогері | 🟡 (EVA блокує бота) |
| Аврора | avrora.ua | дискаунтер непродовольчих | 🟡 |

### Німеччина (розширення)

| Мережа | Домен | Тип | Онлайн-ціни |
|---|---|---|---|
| REWE | rewe.de | супермаркет | ✅, але антибот (403) — виключено |
| EDEKA / Marktkauf | edeka.de | супермаркет | 🟡 (ціни конкретного маркету) |
| Netto Marken-Discount | netto-online.de | дискаунтер | ✅, але антибот — виключено |
| NETTO (Dansk Supermarked) | netto.de | дискаунтер | 🟡 |
| dm | dm.de | дрогері | ✅, API закрите robots.txt — виключено |
| Rossmann | rossmann.de | дрогері | ✅, JS-челендж — виключено |
| Müller | mueller.de | дрогері | ✅ |
| tegut | tegut.com | супермаркет | ✅ |
| real (online) | real.de | маркетплейс | ❓ |
| Picnic | picnic.app | онлайн-доставка | ✅ лише в застосунку |
| Flink, Knuspr | goflink.com, knuspr.de | доставка | ✅ |
| Bünting / combi, famila, Hit, Globus (уже є), V-Markt, Norma (уже є) | — | регіональні | 🟡 |

### Польща

| Мережа | Домен | Тип | Онлайн-ціни |
|---|---|---|---|
| Biedronka | biedronka.pl | дискаунтер | 🟡 |
| Lidl Polska | lidl.pl | дискаунтер | 🟡 |
| Żabka | zabka.pl | магазини біля дому | 🟡 |
| Kaufland Polska | kaufland.pl | гіпермаркет | 🟡 |
| Auchan Polska | auchan.pl | гіпермаркет | ✅ |
| Carrefour Polska | carrefour.pl | гіпермаркет | ✅ |
| Netto Polska | netto.pl | дискаунтер | 🟡 |
| Dino | grupadino.pl | супермаркет | ❓ |
| Stokrotka | stokrotka.pl | супермаркет | ✅ |
| Frisco | frisco.pl | онлайн-супермаркет | ✅ |
| Rossmann PL, Hebe | rossmann.pl, hebe.pl | дрогері | ✅ |
| Polomarket, Intermarché PL, Topaz, Lewiatan | — | регіональні | ❓ |

### Чехія, Словаччина

| Мережа | Країни | Домен | Онлайн-ціни |
|---|---|---|---|
| Albert (Ahold) | CZ | albert.cz | 🟡 |
| Billa | CZ, SK | billa.cz, billa.sk | ✅ |
| Penny | CZ | penny.cz | 🟡 |
| Tesco | CZ, SK | itesco.cz, tesco.sk | ✅ |
| Kaufland | CZ, SK | kaufland.cz | 🟡 |
| Lidl | CZ, SK | lidl.cz, lidl.sk | 🟡 |
| Globus | CZ | globus.cz | ✅ |
| Rohlik.cz | CZ | rohlik.cz | ✅ (онлайн-супермаркет) |
| COOP Jednota | SK | coop.sk | ❓ |
| Terno, Fresh | SK | — | ❓ |

### Австрія, Швейцарія

| Мережа | Країна | Домен | Онлайн-ціни |
|---|---|---|---|
| BILLA / BILLA PLUS | AT | billa.at | ✅ |
| SPAR / INTERSPAR / EUROSPAR | AT | spar.at | ✅ |
| Hofer (ALDI SÜD) | AT | hofer.at | ✅ |
| Lidl Österreich | AT | lidl.at | 🟡 |
| Penny | AT | penny.at | 🟡 |
| MPREIS | AT | mpreis.at | ❓ |
| Unimarkt | AT | unimarkt.at | ❓ |
| Migros | CH | migros.ch | ✅ |
| Coop | CH | coop.ch | ✅ |
| Denner | CH | denner.ch | ✅ |
| ALDI SUISSE | CH | aldi-suisse.ch | ✅ |
| Lidl Schweiz | CH | lidl.ch | 🟡 |
| Volg, Manor Food | CH | — | ❓ |

### Франція, Бельгія, Нідерланди, Люксембург

| Мережа | Країни | Домен | Онлайн-ціни |
|---|---|---|---|
| Carrefour | FR, BE | carrefour.fr, carrefour.be | ✅ |
| E.Leclerc | FR | e.leclerc | ✅ |
| Intermarché (Les Mousquetaires) | FR, BE | intermarche.com | ✅ |
| Auchan | FR | auchan.fr | ✅ |
| Système U | FR | magasins-u.com, coursesu.com | ✅ |
| Casino / Monoprix / Franprix | FR | monoprix.fr | ✅ |
| Lidl France | FR | lidl.fr | 🟡 |
| ALDI France | FR | aldi.fr | 🟡 |
| Grand Frais, Picard | FR | grandfrais.com, picard.fr | ✅ (Picard) |
| Colruyt | BE | colruyt.be | ✅ |
| Delhaize | BE | delhaize.be | ✅ |
| Albert Heijn | NL, BE | ah.nl, ah.be | ✅ |
| Jumbo | NL, BE | jumbo.com | ✅ |
| Plus, Dirk, DekaMarkt, Vomar, Hoogvliet, Coop NL | NL | — | ✅ (більшість) |
| ALDI / Lidl NL | NL | aldi.nl, lidl.nl | 🟡 |
| Cactus | LU | cactus.lu | ✅ |

### Велика Британія, Ірландія

| Мережа | Домен | Онлайн-ціни |
|---|---|---|
| Tesco | tesco.com | ✅ |
| Sainsbury's | sainsburys.co.uk | ✅ |
| Asda | asda.com | ✅ |
| Morrisons | morrisons.com | ✅ |
| Waitrose | waitrose.com | ✅ |
| Ocado | ocado.com | ✅ |
| Iceland | iceland.co.uk | ✅ |
| Co-op | coop.co.uk | 🟡 |
| ALDI UK | aldi.co.uk | ✅ |
| Lidl GB | lidl.co.uk | 🟡 |
| M&S Food | marksandspencer.com | 🟡 |
| Boots, Superdrug | boots.com, superdrug.com | ✅ (дрогері) |
| Dunnes Stores, SuperValu, Tesco IE (Ірландія) | dunnesstoresgrocery.com, supervalu.ie, tesco.ie | ✅ |

### Південна Європа

| Мережа | Країни | Домен | Онлайн-ціни |
|---|---|---|---|
| Mercadona | ES | mercadona.es | ✅ |
| Carrefour España | ES | carrefour.es | ✅ |
| Dia | ES | dia.es | ✅ |
| Eroski | ES | eroski.es | ✅ |
| Alcampo (Auchan) | ES | alcampo.es | ✅ |
| Consum, Lidl ES, ALDI ES, El Corte Inglés | ES | — | ✅ / 🟡 |
| Continente | PT | continente.pt | ✅ |
| Pingo Doce | PT | pingodoce.pt | 🟡 |
| Auchan PT, Intermarché PT, Lidl PT, Minipreço | PT | — | ✅ / 🟡 |
| Esselunga | IT | esselunga.it | ✅ |
| Coop Italia | IT | e-coop.it | ✅ |
| Conad | IT | conad.it | ✅ |
| Carrefour Italia | IT | carrefour.it | ✅ |
| Eurospin, Lidl IT, MD, Penny IT, Pam, Despar, Bennet, Iper | IT | — | 🟡 |
| Sklavenitis | GR | sklavenitis.gr | ✅ |
| AB Vassilopoulos (Ahold Delhaize) | GR | ab.gr | ✅ |
| Masoutis, My Market, Lidl Hellas | GR | — | ✅ / 🟡 |
| Konzum, Plodine, Tommy, Studenac | HR | — | ✅ (у Хорватії є обов'язкові відкриті прайси) |
| Mercator, Tuš | SI | mercator.si | ✅ |
| Maxi, Idea | RS | maxi.rs, idea.rs | ✅ |
| Kaufland, Lidl, Fantastico, Billa | BG | — | 🟡 |
| Mega Image, Carrefour RO, Kaufland RO, Profi, Auchan RO, Penny RO | RO | mega-image.ro, carrefour.ro | ✅ / 🟡 |
| Tesco HU, SPAR HU, Auchan HU, CBA, Penny HU | HU | — | ✅ / 🟡 |

### Північна Європа та Балтія

| Мережа | Країни | Домен | Онлайн-ціни |
|---|---|---|---|
| ICA | SE | ica.se | ✅ |
| Coop Sverige | SE | coop.se | ✅ |
| Willys, Hemköp (Axfood) | SE | willys.se, hemkop.se | ✅ |
| Lidl SE | SE | lidl.se | 🟡 |
| Rema 1000, Kiwi, Meny, Coop NO, Extra | NO | — | ✅ (є агрегатор Kassalapp) |
| Netto, Føtex, Bilka (Salling) | DK | salling.dk | ✅ |
| Rema 1000 DK, Coop DK, Lidl DK | DK | — | ✅ / 🟡 |
| K-Market / K-Citymarket (Kesko) | FI | k-ruoka.fi | ✅ |
| S-Market / Prisma (S Group) | FI, EE | s-kaupat.fi, prismamarket.ee | ✅ |
| Lidl FI | FI | lidl.fi | 🟡 |
| Rimi | EE, LV, LT | rimi.ee, rimi.lv, rimi.lt | ✅ |
| Maxima | LT, LV, EE | barbora.lt (онлайн) | ✅ |
| Selver, Coop Eesti | EE | selver.ee | ✅ |
| Iki, Norfa, Lidl LT | LT | — | 🟡 |

### Інші країни Європи

| Мережа | Країни | Онлайн-ціни |
|---|---|---|
| Linella, Nr.1, Kaufland MD | MD | ❓ |
| Евроопт, Гиппо, Корона | BY | ❓ (санкційні ризики, імовірно виключити) |
| Migros TR, BİM, A101, ŞOK, CarrefourSA | TR | ✅ / 🟡 |

---

## Америка

### США

| Мережа | Домен | Тип | Онлайн-ціни |
|---|---|---|---|
| Walmart | walmart.com | гіпермаркет | ✅ (сильний антибот) |
| Kroger (+ Ralphs, Fred Meyer, King Soopers, Harris Teeter) | kroger.com | супермаркет | ✅ (ціни магазину) |
| Costco | costco.com | клубний | ✅ |
| Target | target.com | гіпермаркет | ✅ |
| Albertsons / Safeway / Vons / Jewel-Osco | albertsons.com, safeway.com | супермаркет | ✅ |
| Publix | publix.com | супермаркет | ✅ |
| H-E-B | heb.com | супермаркет | ✅ |
| Ahold Delhaize USA (Food Lion, Stop & Shop, Giant, Hannaford) | foodlion.com | супермаркет | ✅ |
| Aldi US | aldi.us | дискаунтер | ✅ |
| Lidl US | lidl.com | дискаунтер | ✅ |
| Trader Joe's | traderjoes.com | спеціалізований | 🟡 |
| Whole Foods (Amazon) | wholefoodsmarket.com | органік | ✅ |
| Amazon Fresh | amazon.com | онлайн | ✅ (антибот) |
| Wegmans, Meijer, Hy-Vee, Sprouts, WinCo, Giant Eagle, ShopRite | — | регіональні | ✅ |
| Dollar General, Dollar Tree, Family Dollar | — | дискаунтери | 🟡 |
| CVS, Walgreens | cvs.com, walgreens.com | аптека/дрогері | ✅ |
| Instacart | instacart.com | агрегатор доставки | ✅ (агрегує ціни багатьох мереж, потрібен логін) |

### Канада

| Мережа | Домен | Онлайн-ціни |
|---|---|---|
| Loblaws (+ No Frills, Real Canadian Superstore, Shoppers Drug Mart) | loblaws.ca, nofrills.ca | ✅ |
| Sobeys (+ Safeway CA, IGA, FreshCo, Foodland) | sobeys.com | ✅ |
| Metro (+ Food Basics) | metro.ca | ✅ |
| Walmart Canada | walmart.ca | ✅ |
| Costco Canada | costco.ca | ✅ |
| Save-On-Foods | saveonfoods.com | ✅ |
| Giant Tiger | gianttiger.com | ✅ |

### Латинська Америка

| Мережа | Країни | Онлайн-ціни |
|---|---|---|
| Walmex / Bodega Aurrerá / Sam's Club | MX | ✅ |
| Soriana, Chedraui, La Comer, OXXO | MX | ✅ / 🟡 |
| Carrefour Brasil, Atacadão, Assaí, Pão de Açúcar (GPA), Extra | BR | ✅ |
| Supermercados BH, Zaffari, Savegnago | BR | ✅ |
| Cencosud (Jumbo, Disco, Vea, Santa Isabel) | AR, CL, CO, PE | ✅ |
| Coto, Carrefour Argentina, Día AR | AR | ✅ |
| Lider (Walmart Chile), Unimarc, Tottus | CL | ✅ |
| Éxito, Olímpica, D1, Ara | CO | ✅ / 🟡 |
| Plaza Vea, Tottus, Wong, Metro PE | PE | ✅ |
| Tienda Inglesa, Disco UY | UY | ✅ |

---

## Японія

| Мережа | Домен | Тип | Онлайн-ціни |
|---|---|---|---|
| AEON / AEON Mall / MaxValu | aeon.com, aeonnetshop.com | гіпермаркет/супермаркет | ✅ |
| Ito-Yokado (Seven & i) | itoyokado.co.jp | гіпермаркет | ✅ (net super) |
| 7-Eleven Japan | sej.co.jp | конбіні | 🟡 |
| FamilyMart | family.co.jp | конбіні | 🟡 |
| Lawson | lawson.co.jp | конбіні | 🟡 |
| Life Corporation | lifecorp.jp | супермаркет | ✅ (net super) |
| Seiyu (KKR/Trial) | seiyu.co.jp | супермаркет | ✅ |
| Gyomu Super | gyomusuper.jp | дискаунтер | 🟡 |
| Don Quijote (PPIH) | donki.com | дискаунтер | 🟡 |
| OK Store | ok-corporation.jp | дискаунтер | 🟡 |
| Summit, Maruetsu, Inageya, York-Benimaru, Ozeki | — | регіональні | 🟡 |
| Matsumoto Kiyoshi, Welcia, Tsuruha, Sugi | — | дрогері | ✅ |
| Rakuten Seiyu Netsuper, Amazon JP | — | онлайн | ✅ |

## Азія

| Мережа | Країни | Онлайн-ціни |
|---|---|---|
| E-mart, Lotte Mart, Homeplus, GS25, CU, Coupang | KR | ✅ |
| Hema (Alibaba), Yonghui, RT-Mart (Sun Art), Walmart China, JD Mall, Meituan | CN | ✅ (часто лише в застосунках) |
| PX Mart, Carrefour TW, FamilyMart TW, 7-Eleven TW | TW | ✅ / 🟡 |
| ParknShop, Wellcome, Aeon HK | HK | ✅ |
| FairPrice (NTUC), Cold Storage, Giant SG, Sheng Siong | SG | ✅ |
| Lotus's, Big C, Tops, Makro, 7-Eleven TH | TH | ✅ |
| Giant MY, Lotus's MY, AEON MY, Mydin, 99 Speedmart | MY | ✅ / 🟡 |
| Alfamart, Indomaret, Hypermart, Transmart | ID | ✅ / 🟡 |
| SM Supermarket, Puregold, Robinsons | PH | ✅ |
| WinMart (Masan), Co.opmart, Bach Hoa Xanh, Lotte Mart VN | VN | ✅ |
| Reliance Smart / JioMart, DMart, BigBasket, Spencer's, More, Blinkit, Zepto | IN | ✅ |
| Carrefour (Majid Al Futtaim), Lulu, Spinneys, Panda, Tamimi | UAE, SA, QA | ✅ |
| Shufersal, Rami Levy, Victory | IL | ✅ (є державний обов'язок публікувати ціни — Price Transparency Law) |
| Magnit, Pyaterochka, Perekrestok | RU | — **виключено** (санкції, етичні причини) |

## Океанія та Африка (довідково)

| Мережа | Країни | Онлайн-ціни |
|---|---|---|
| Woolworths, Coles, ALDI AU, IGA | AU | ✅ |
| Countdown/Woolworths NZ, New World, Pak'nSave | NZ | ✅ |
| Shoprite, Checkers, Pick n Pay, Woolworths SA, Spar SA | ZA | ✅ |
| Carrefour (Égypte, Maroc), Marjane | EG, MA | ✅ |

---

## Відкриті джерела цін (пріоритетні замість окремих парсерів)

| Джерело | Охоплення | Примітка |
|---|---|---|
| Open Prices (Open Food Facts) | світ | уже використовується для Lidl DE, ODbL |
| Kassalapp API | NO | агрегує ціни норвезьких мереж, API з ключем |
| Державні прайси Хорватії | HR | мережі зобов'язані публікувати прайси щодня з 2025 р. |
| Israel Price Transparency | IL | XML-файли мереж за законом |
| Prix-carburants / Prix alimentaires (Франція) | FR | частково, переважно пальне |
| Grocery price datasets (Statistics agencies, Eurostat HICP) | EU | агреговані індекси, не ціни SKU — для валідації аналітики |

## Що потрібно в архітектурі для глобального охоплення

- `Country`/`Currency` уже є, але потрібні курси валют (ECB/НБУ) і порівняння в одній валюті.
- Мовно-залежна нормалізація назв: стоп-слова, смаки й одиниці для кожної мови (`features.ts` зараз знає UA/DE/EN), транслітерація для CJK.
- Ціни, прив'язані до магазину/регіону (`Store`, `PriceSnapshot.storeId`), бо в США, Японії, Польщі ціни часто залежать від магазину.
- Геодані магазинів (`Store.latitude/longitude`) — з сайтів мереж або OpenStreetMap (`shop=supermarket`, тег `brand:wikidata`).
- Аналоги товарів (інші бренди тієї ж категорії й фасування) — окрема сутність або обчислення на рівні категорії.
- Масштабований скрапер: кілька воркерів, розподілений rate limiting по доменах, черга зі підтвердженнями.

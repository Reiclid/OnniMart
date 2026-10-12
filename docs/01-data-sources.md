# Джерела даних та аудит robots.txt

Перевірено **11.10.2026**. robots.txt завантажувались через `curl`, а сайти з антибот-захистом — через звичайний браузер. Окремо перевірено, як кожен сайт відповідає на чесний User-Agent нашого бота:

```
OnniMartBot/0.1 (+https://github.com/Reiclid/OnniMart; diploma project)
```

Правила robots.txt дано за [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309):

- для бота діє найконкретніша група `User-agent`; якщо її немає, діє `*`;
- з правил `Allow` і `Disallow` перемагає найдовший збіг;
- відповідь 4xx на `/robots.txt` означає «обмежень немає», а 5xx або відсутність відповіді — «заборонено все».

> robots.txt — це технічна домовленість, а не закон. Юридичні рамки описано [нижче](#юридичні-рамки). Для диплома важливо показати, що система їх свідомо дотримується.

## Підсумок

| Статус | Що означає | Мережі |
|---|---|---|
| ✅ | robots.txt дозволяє каталог і сторінки товарів, бот отримує 200 | АТБ, Сільпо, вітрини zakaz.ua (NOVUS, Ашан, METRO, ЕКО маркет, МегаМаркет), VARUS, Fozzy, Lidl, ALDI Nord, ALDI SÜD, Globus |
| ⚠️ | Дозволено, але з умовами: пагінація заборонена (лише sitemap), великий Crawl-delay, є лише акційні сторінки або ціни окремого маркету | Lidl (без `?offset=` → Open Prices), Kaufland (Filiale), PENNY, NORMA — лише акції; EDEKA (ціни маркету), Фора (без SSR), Watsons (без `?page=`), edeka24 (Crawl-delay 20 с), EVA / Prostor (див. таблицю) |
| ❌ | Чесного бота блокує антибот-захист (403 / Cloudflare challenge / Akamai) або потрібна авторизація. **Обходити захист не можна.** | REWE, Netto Marken-Discount, Rossmann (JS-челендж), dm (API закрито в robots.txt), EVA, хаб zakaz.ua, Glovo, Rozetka, Kaufland.de (маркетплейс), Picnic |

## Що реально парситься (перевірено наживо 11–12.10.2026)

| Мережа | Джерело | Як отримуємо дані | EAN | Обсяг |
|---|---|---|---|---|
| 🇺🇦 Сільпо | silpo.ua | JSON у `<script id="serverApp-state">` на сторінках категорій, `?page=N` | на сторінці товару (поки не беремо) | 47 товарів на сторінку, ~28 кореневих категорій |
| 🇺🇦 NOVUS, Ашан, METRO, ЕКО маркет, МегаМаркет | `<мережа>.zakaz.ua` | `__NEXT_DATA__` на сторінках категорій, `?page=N` | ✅ | 30 товарів на сторінку |
| 🇺🇦 VARUS | varus.ua | `window.__INITIAL_STATE__` (Vue Storefront) на сторінках категорій, `?page=N` | ❌ | 40 товарів на сторінку, 21 категорія |
| 🇩🇪 ALDI SÜD | aldi-sued.de | HTML-плитки (Nuxt SSR), `?page=N` | ❌ | ~5 000 товарів |
| 🇩🇪 ALDI Nord | aldi-nord.de | результати Algolia в `__NEXT_DATA__` сторінок підкатегорій; список підкатегорій — з sitemap | ❌ | усі товари підкатегорії на одній сторінці |
| 🇩🇪 Globus | produkte.globus.de | HTML-плитки Shopware (`data-product-gtin`), `?p=N` | ✅ | 24 товари на сторінку |
| 🇩🇪 Lidl | prices.openfoodfacts.org | **Open Prices API** — ціни з чеків покупців, ліцензія ODbL | ✅ | сотні цін за пів року, оновлюється спільнотою |
| 🇩🇪 Kaufland | filiale.kaufland.de | JSON для Vue SSR (`window.SSR[…]`) на сторінці `/angebote/uebersicht.html` | частково — у назві файлу зображення | лише акції тижня, ~900 позицій за 1 запит |
| 🇩🇪 PENNY | penny.de | список категорій тижня з `/angebote`, пропозиції — `/.rest/offers/by-category/<тиждень>/<категорія>` | ❌ | лише акції тижня, ~120–250 позицій |
| 🇩🇪 NORMA | norma-online.de | HTML тематичних сторінок акцій `/de/angebote/ab-…/<тема>-t-<id>/` | ❌ | лише акції тижня, ~130 позицій |
| 🇺🇦 АТБ | atbmarket.com | HTML, `?page=N` | ❌ | парсер готовий, вимкнено — сайт на технічних роботах |

**Kaufland, PENNY, NORMA — лише акції.** Ці мережі не публікують повний асортимент з цінами, тільки щотижневі пропозиції. Для диплома це корисне джерело саме про знижки (глибина, частота, «фейкові» знижки), а не про звичайні ціни. Пропозиції, що починають діяти пізніше («ab Donnerstag», наступний тиждень), парсер пропускає, поки їхня дата не настане. Ціни лише з карткою Kaufland або в застосунку PENNY позначаються як `LOYALTY`.

**Kaufland: штрихкод із назви зображення.** Приблизно половина зображень названа GTIN-ом (`…/schwarz/4002334119577_DE_P-1`), решта — внутрішнім 8-значним номером Kaufland. Беремо лише 13–14-значні коди; API все одно перевіряє контрольну цифру.

**Чому Lidl через Open Prices.** Lidl Німеччина не публікує ціни на продукти онлайн:

- на lidl.de продається лише непродовольчий асортимент і вино: «Obst & Gemüse» там — це саджанці, «Bier» — 5-літрові бочки;
- продуктові ціни є лише в листівці-картинці та в застосунку Lidl Plus (потрібен вхід);
- API листівки (`endpoints.leaflets.schwarz`) віддає структуровані дані тільки для товарів онлайн-магазину;
- пагінацію каталогу (`?offset=`) забороняє robots.txt.

Тому для Lidl беремо відкриту базу Open Prices від Open Food Facts: її API дозволено використовувати з власним User-Agent. Обмеження: дані покривають лише те, що купили та відсканували учасники проєкту, і прив'язані до конкретного магазину та дати. Ціни мережі в Німеччині переважно однакові по країні, тому беремо найсвіжішу ціну кожного штрихкоду за останні 180 днів.

**Чому ALDI Nord працює без JavaScript.** Сторінка `/sortiment.html` сама товарів не містить — їх підвантажує JavaScript. Але сторінки підкатегорій (`/sortiment/<розділ>/<підкатегорія>.html`) Next.js рендерить на сервері: у `__NEXT_DATA__` уже лежать усі товари з ціною, старою ціною, міткою знижки й датою її закінчення. Список таких сторінок є в `/sitemaps/.aldi-nord-sitemap-pages.xml`.

## Україна

| Мережа | Домен | Ключові правила для `*` | Crawl-delay | Чесний бот | Штрихкоди в даних | Оцінка |
|---|---|---|---|---|---|---|
| **АТБ** | www.atbmarket.com | `Allow: /catalog/*`, `/product/*`; `Disallow: /*search*`, `/*sort=*`, `/*per-page=*`, `/all-goods*`, `/feed*` | — | 200 (стандартний UA curl — 403) | ні в каталозі; вага/обʼєм у назві («20 г») | ✅ |
| **Сільпо** | silpo.ua | `Disallow: /*?` (крім `?page=`, `?utm_source=`), фільтри, `/detail/`, кошик, акаунт | — | 200 | **так**: SSR-JSON містить `barcodes` (EAN-13/8 + внутрішні коди), `displayRatio` («0,5л»), `brandTitle`, `price`, `oldPrice` | ✅ |
| **NOVUS** | novus.zakaz.ua | `Disallow: /n/`; є `llms.txt` з описом URL-шаблонів | — | 200 | **так**: `ean` у SSR-JSON і в URL товару (`/uk/products/<slug>--<EAN>/`), `volume`, `weight`, `unit`, `price` у копійках | ✅ |
| Ашан | auchan.zakaz.ua | як NOVUS | — | 200 | так | ✅ |
| METRO | metro.zakaz.ua, shop.metro.ua | zakaz — як NOVUS; shop.metro.ua: `Disallow: /shop/search?*`, `/backend/*` | — | 200 | так (zakaz) | ✅ |
| ЕКО маркет | eko.zakaz.ua | як NOVUS | — | — | так | ✅ |
| МегаМаркет | megamarket.zakaz.ua, megamarket.ua | megamarket.ua: `Disallow: /api/`, `/cart/`, `/user/` | **3 с** | — | так (zakaz) | ✅ |
| API zakaz.ua | stores-api.zakaz.ua | `Disallow: /` | — | — | — | ❌ **не використовувати**, лише HTML-вітрини |
| VARUS | varus.ua | обмежень немає, є `sitemap-index.xml` | — | 200 | ні; є бренд, вага / обʼєм, акційна ціна з датою закінчення | ✅ |
| Фора | fora.ua | `Disallow: /cart`, `/checkout`, `/search/all?find=`, сортування | — | 200 | React без SSR: HTML порожній, дані — з окремого API (не перевіряли) | ⚠️ |
| Fozzy | fozzyshop.ua | `Disallow: /search`, `/basket`, `/checkout`, `/cabinet/` | — | 200 | треба перевірити | ✅ |
| Ашан (власний сайт) | auchan.ua | `Disallow: /catalogsearch/`, `/?`, `/view/*`, `/nav/` | — | Cloudflare captcha | — | ⚠️ використовувати auchan.zakaz.ua |
| Таврія В | tavriav.ua | robots.txt → 403 (S3 AccessDenied) | — | — | — | ⚠️ формально 4xx = дозволено, але краще уточнити вручну |
| EVA | eva.ua | `Disallow: /*?`, `/catalog/` (внутрішні шляхи Magento) | — | **403** | — | ❌ |
| Prostor | prostor.ua | `Disallow: */catalog/*` (Magento) | — | — | — | ⚠️ |
| Watsons | watsons.ua | `Disallow: /*page=*`, `/search*` | — | Akamai для curl | — | ⚠️ лише через sitemap |
| Наш Край, Рукавичка, SPAR, Копійка, Траш, Близенько, Сім23, Аврора | — | обмежень майже немає (WordPress, сторінки акцій) | — | — | — | ✅ (переважно лише листівки акцій) |
| Glovo | glovoapp.com | robots.txt недоступний (CloudFront 403) | — | 403 | — | ❌ |
| Rozetka | rozetka.com.ua | Cloudflare challenge | — | 403 | — | ❌ |

> **Ризик:** 11.10.2026 головна сторінка АТБ показувала «Зараз на сайті ведуться технічні роботи», а сторінки товарів віддавали 503. Сторінки каталогу при цьому працювали. Не варто будувати систему на одному джерелі — це аргумент за кілька мереж і за журнал запусків (`ScrapeRun`).

## Німеччина

| Мережа | Домен | Ключові правила для `*` | Crawl-delay | Чесний бот | Примітка | Оцінка |
|---|---|---|---|---|---|---|
| **Lidl** | www.lidl.de | `Disallow: *?offset=*`, `*sort=*`, `*id=*`, `*search?q=*`, `/user-api/*` | — | 200 | продуктів онлайн немає (лише листівка-картинка й застосунок) → ціни з **Open Prices** | ⚠️ → Open Prices |
| **ALDI Nord** | www.aldi-nord.de | `Disallow: /*?*filters`, кілька службових сторінок | — | 200 | товари в `__NEXT_DATA__` сторінок підкатегорій | ✅ |
| **ALDI SÜD** | www.aldi-sued.de | `Disallow: /tools`, `/*?q=`; `Allow: /*?page=*`; є `sitemap_products.xml` | — | 200 (curl з UA Chrome — Akamai 403) | явно дозволяє AI-ботів | ✅ |
| **PENNY** | www.penny.de | `Allow: /` | — | 200 | лише акції тижня через `/.rest/offers/…` | ✅ |
| EDEKA | www.edeka.de | `Disallow: /EDEKA/`, `/lieferservice/`, `/xml/` | — | 200 | акції завантажує JavaScript окремо для кожного маркету — загальної ціни мережі немає | ⚠️ |
| edeka24 | www.edeka24.de | блокує GPTBot / CCBot | **20 с** | 200 | онлайн-магазин | ⚠️ повільно |
| **Kaufland** | filiale.kaufland.de | `Disallow: /angebote/aktuell/uebersicht/detail` та ін.; сам огляд `/angebote/uebersicht.html` дозволено | — | 200 | лише акції тижня (JSON у сторінці огляду) | ✅ |
| Kaufland | www.kaufland.de | Cloudflare captcha | — | — | маркетплейс | ❌ |
| Globus | produkte.globus.de, globus.de | `Disallow: /produkte/listing`, `/checkout`, `/account` | — | 200 | товари — через sitemap | ✅ |
| **NORMA** | www.norma-online.de | `Disallow: /ws/`; блокує `Python-urllib`, `Wget` та ін. за назвою | — | 200 | лише акції тижня, переважно непродовольчі | ✅ |
| dm | www.dm.de | `Disallow: /search`, `/cart` | — | 200 | сайт — SPA, а API товарів `product-search.services.dmtech.com` має `Disallow: /` | ❌ |
| Rossmann | www.rossmann.de | `Disallow: /*?*` (крім пагінації), блокує ClaudeBot | — | **JS-челендж** | «Client Challenge» замість сторінки | ❌ |
| REWE | www.rewe.de | robots.txt дозволяє `/angebote/…`, але… | — | **403** | антибот-захист | ❌ |
| Netto Marken-Discount | www.netto-online.de | `Disallow: /INTERSHOP/`, `/media/handzettel/` | — | **403** | антибот-захист | ❌ |
| Picnic | picnic.app | групи лише для іменованих ботів | — | — | ціни лише в застосунку після входу | ❌ |
| marktguru / kaufDA | marktguru.de, kaufda.de | marktguru — без правил; kaufDA — Crawl-delay 2, `Disallow: /api/…` | 2 с | — | агрегатори листівок, дані ліцензовані → лише як ідея | ⚠️ |

## Відкриті джерела про товари

**[Open Food Facts](https://world.openfoodfacts.org)** — відкрита база товарів за штрихкодом під ліцензією ODbL: склад, КБЖВ, алергени, Nutri-Score, фото.

- robots.txt забороняє краулерам `/api`, але офіційний API для застосунків дозволений: зі своїм User-Agent і з лімітами (приблизно 100 запитів на хвилину на читання товару).
- Є щоденні повні дампи (CSV / JSONL / Parquet).
- **Рекомендація:** первинно наповнити `Product.attributes` і `Barcode` з дампу, а для сканування штрихкоду в застосунку робити запит до API з кешуванням.

## Правила поведінки нашого парсера

1. **Чесний User-Agent** з посиланням на проєкт. Не підробляти браузер: тест показав, що АТБ, Сільпо, zakaz.ua, Lidl, ALDI та PENNY пропускають бота з чесним UA.
2. **Перевіряти robots.txt програмно** перед кожним запуском (у Rust, наприклад, crate `texting_robots`) і зберігати дату перевірки в `StoreChain.robotsCheckedAt`.
3. **Пауза між запитами** — `StoreChain.crawlDelayMs` (за замовчуванням 3 с, не менше `Crawl-delay`). Не більше одного одночасного запиту на домен.
4. **Не обходити захист**: Cloudflare challenge, captcha, Akamai, авторизацію. Отримали 403 чи 429 — зупиняємось з експоненційною паузою і пишемо помилку в `ScrapeRun.error`.
5. **Не використовувати API, закриті robots.txt** (наприклад, `stores-api.zakaz.ua`). Дані беремо з HTML, який сайт віддає звичайним відвідувачам.
6. **Розклад**: повний каталог — раз на добу вночі, сторінки акцій — кожні 3–6 годин. Ціни в продуктових мережах змінюються переважно раз на тиждень (нові акції), тому погодинний повний обхід лише навантажує сайти.
7. **Не копіювати авторський контент**: ціни — це факти, а фото й описи — обʼєкти авторського права. Зберігаємо лише посилання на фото (`imageUrl`), а описи беремо з Open Food Facts.

## Юридичні рамки

*Це не юридична консультація, а огляд для відповідного розділу диплома.*

**Україна.** Новий Закон «Про авторське право і суміжні права» № 2811-IX (чинний з 01.01.2023) запровадив право *sui generis* на неоригінальні бази даних, створені зі значними інвестиціями. Виробник бази може забороняти витягування та повторне використання **всього вмісту або його суттєвої частини** — у тому числі систематичне витягування малими частинами. Ризик зменшують:

- некомерційна, навчальна мета;
- збір лише фактичних даних (ціна, назва, кількість);
- відсутність повного відтворення каталогу для сторонніх осіб.

Умови користування сайтів АТБ і Сільпо знайти не вдалося. В оферті NOVUS на zakaz.ua прямої заборони парсингу немає, але вона посилається на окремі «Умови користування» (zakaz.ua/uk/terms/), закриті Cloudflare. **Ці документи треба перечитати вручну перед захистом.**

**Німеччина / ЄС.**

- §87a–87b UrhG (право виробника бази даних, Директива 96/9/ЄС) — та сама логіка «суттєвої частини».
- §44b UrhG дозволяє Text and Data Mining, якщо правовласник не заборонив його у **машиночитаній формі**. Чи вважається такою формою robots.txt, остаточно не вирішено. Проте суди (LG Hamburg, справа LAION) схиляються до широкого тлумачення, тож robots.txt треба поважати.
- BGH, I ZR 224/12 «Flugvermittlung im Internet» (2014): автоматичне зчитування загальнодоступних даних не є саме по собі недобросовісною конкуренцією, навіть усупереч умовам сайту. А от **обхід технічних засобів захисту** вже може бути порушенням. Звідси правило № 4 вище.

Джерела:

- [Закон № 2811-IX (WIPO Lex)](https://www.wipo.int/wipolex/en/legislation/details/22385)
- [Право sui generis на бази даних (УкрНОІВ)](https://nipo.gov.ua/wp-content/uploads/2025/06/Avtorske_pravo_bazy_MVS-Tolkachova-web.pdf)
- [§ 44b UrhG](https://www.gesetze-im-internet.de/urhg/__44b.html)
- [TDM-Vorbehalt і машиночитаність](https://lausen.com/der-text-und-data-mining-vorbehalt-technische-umsetzung-der-maschinenlesbarkeit/)
- [LG Hamburg, LAION (LTO)](https://www.lto.de/recht/hintergruende/h/kuenstliche-intelligenz-ki-urheberrecht-text-data-mining-lg-hamburg-310o22723)
- [BGH I ZR 224/12 (LTO)](https://www.lto.de/recht/hintergruende/h/bgh-urteil-izr22412-screen-scraping-flugdaten-automatisiert-auslesen-ryanair-reiseportal)
- [BGH I ZR 224/12 (Kanzlei Plutte)](https://www.ra-plutte.de/bgh-zum-automatisierten-auslesen-fremder-websites-via-screen-scraping/)

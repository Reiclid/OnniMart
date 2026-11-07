# Схема зіставлення товарів

Як картка мережі (`Listing`) стає частиною каталогу: товар (`Product`) → фасування (`ProductVariant`) → картки мереж з цінами. Текстовий опис алгоритму, пороги й оцінка якості — у [02-database.md](02-database.md#зіставлення-товарів-головна-наукова-частина), варіації — у [08-variations.md](08-variations.md). Тут — схеми того, як це працює в коді.

## 1. Загальний потік

```mermaid
flowchart TD
    S[Rust-парсер] -->|JSON| Q[(Redis<br/>scraper:results)]
    Q --> I[IngestionService<br/>воркер]
    I --> N["parseQuantity + normalizeBarcodes<br/>upsert Listing, PriceSnapshot"]
    N --> B{GTIN картки вже<br/>є в barcodes?}
    B -- так --> AB[Listing.variantId<br/>AUTO_MATCHED · BARCODE]
    B -- ні --> P[Listing: PENDING]
    I -->|подія обходу<br/>run_finished тощо| SCH[MatchingService.schedule]
    API[POST /api/v1/matching/run] -->|Redis matching:requests| SCH
    SCH --> RUN[Пакет зіставлення<br/>розділ 2]
    P --> RUN
    RUN --> D{CatalogIndex.decide<br/>розділ 3}
    D -- barcode / fuzzy --> M[Картка → наявне фасування<br/>AUTO_MATCHED]
    D -- review --> MC[(match_candidates<br/>SUGGESTED)]
    D -- variant --> V[Нове ProductVariant<br/>наявного товару]
    D -- product --> NP[Новий Product + фасування<br/>matchMethod = CREATED]
    MC --> UI["/matching — модератор"]
    UI -- підтвердив --> CM[CONFIRMED · MANUAL<br/>штрихкоди → фасування]
    UI -- відхилив усіх --> RJ[пари REJECTED<br/>картка — новий товар]
    CM & RJ --> DEC["/admin/decisions<br/>журнал і скасування"]
```

Зіставлення за штрихкодом відбувається двічі: одразу при інжесті ([`ingestion.service.ts`](../apps/api/src/modules/scraper/services/ingestion.service.ts), `matchByBarcode`) — щоб нова ціна відомого товару зʼявилась без чекання пакета, — і першим кроком `decide` у пакеті, для штрихкодів, які зʼявились у каталозі вже після інжесту картки.

## 2. Пакет зіставлення у воркері

Код — `execute()` у [`matching.service.ts`](../apps/api/src/modules/catalog/matching/matching.service.ts). Пакет один на воркер: якщо під час роботи прийшов ще запит, наступний пакет запуститься одразу після поточного.

```mermaid
flowchart TD
    A[loadVocabulary] --> A1["словник брендів по країнах<br/>IDF слів по країнах (GROUP BY у PostgreSQL)<br/>вивчені варіації (learnVariations)<br/>кеш у воркері ~1 год"]
    A1 --> A2[brand_aliases → основний бренд]
    A2 --> A3["tokenize: listings.nameTokens<br/>для нових / змінених карток"]
    A3 --> A4[syncKeys: match_keys<br/>для нових фасувань і карток]
    A4 --> R[Картки PENDING без variantId<br/>і без SUGGESTED-кандидатів]
    R --> C["CatalogIndex: IDF, варіації<br/>+ variation_overrides (/admin/variations)<br/>+ matching_rules (/admin/rules)"]
    C --> L["loadCandidates: лише фасування,<br/>зі спільним match_key або штрихкодом"]
    L --> O[Сортування: спершу картки<br/>зі штрихкодом — «якорі»]
    O --> LOOP{{для кожної картки}}
    LOOP --> DEC[decide → apply<br/>запис у БД + index.register]
    DEC --> LOOP
    LOOP -->|кінець| F["match_rule_hits · статистика товарів<br/>категорії · фото · пошуковий індекс"]
    F --> MR[(match_runs — звіт)]
    MR --> ST[Redis matching:state<br/>GET /matching/status]
```

Після кожного рішення картка одразу додається в індекс (`register`): наступна картка пакета вже бачить фасування, створене попередньою. Тому дві нові картки того самого товару з різних мереж в одному пакеті зливаються, а не створюють два товари.

### Блокування кандидатів

Порівнювати кожну картку з усім каталогом надто дорого, тож кандидатів відбирають за ключами ([`catalog-index.ts`](../packages/matching/src/catalog-index.ts), ті самі ключі зберігаються в `match_keys`):

| Ключ | Приклад | Навіщо |
|---|---|---|
| фасування + перші 4 літери слова | `VOLUME:1500:1\|морш` | кандидати-фасування того самого розміру зі спільним словом |
| бренд | `b:morshynska` | товари бренду — для нового фасування |
| штрихкод | `04820…` (GTIN-14) | прямий збіг |

## 3. Рішення для однієї картки — `CatalogIndex.decide`

```mermaid
flowchart TD
    START([Картка: бренд, слова, ознаки,<br/>фасування, GTIN, країна, мережа]) --> BC{правило barcode:<br/>GTIN уже в каталозі?}
    BC -- так --> RB([barcode → те саме фасування])
    BC -- ні --> SC["score: кандидати з блоків<br/>(те саме фасування + спільне слово)"]
    SC --> EX["відкинути: активна картка тієї ж мережі,<br/>пара REJECTED модератором,<br/>чужа країна зі схожістю < 0,99"]
    EX --> PS[scorePair з кожною назвою фасування<br/>розділ 4 · найкраща оцінка]
    PS --> DOM[Кандидати своєї країни]
    DOM --> RO{"rangeOffers: ≥ 2 смаки однієї назви<br/>або вже є сусідній смак?"}
    RO -- так --> RO2["прибрати кандидатів-назви без смаку"]
    RO -- ні --> T1
    RO2 --> T1{"best ≥ 0,90<br/>і відрив від другого ≥ 0,05<br/>і (GTIN не конфліктує або best ≥ 0,99)"}
    T1 -- так --> RF([fuzzy → AUTO_MATCHED])
    T1 -- ні --> FN{"fullName: best = 1 без відриву<br/>і в повних збігів GTIN не конфліктує?"}
    FN -- так --> RF3([fuzzy → фасування, яке<br/>продає найбільше мереж])
    FN -- ні --> T2{best ≥ 0,70?}
    T2 -- так --> RR([review → до 3 кандидатів<br/>у match_candidates])
    T2 -- ні --> CC{"crossCountry: один чужий<br/>кандидат ≥ 0,99 без конфлікту GTIN?"}
    CC -- так --> RF2([fuzzy → фасування іншої країни])
    CC -- ні --> NV{"newVariant: товар того самого бренду<br/>без такого фасування, схожість ≥ 0,90?"}
    NV -- так --> RV([variant → нове фасування товару])
    NV -- ні --> RP([product → новий товар])
```

Кожне рішення несе список правил, що на нього вплинули (`decision.rules`), — вони пишуться в `match_rule_hits` і показуються на `/admin/rules`.

## 4. Оцінка пари назв — `scorePair`

Код — [`similarity.ts`](../packages/matching/src/similarity.ts). Ознаки назви (бренд, значущі слова, ознаки різновиду) готує [`features.ts`](../packages/matching/src/features.ts).

```mermaid
flowchart TD
    A([Ознаки картки A і назви B]) --> AT{"attributes: ознака різновиду<br/>різна (Zero, без лактози, bio, жирність…)?"}
    AT -- так --> Z1([0 · інший товар])
    AT -- ні --> CH{"choice: «oder», «в асортименті»<br/>лише з одного боку?"}
    CH -- так --> Z2([0])
    CH -- ні --> BR{бренди різні?}
    BR -- так --> Z3([0])
    BR -- ні --> VA{"variations: різні вивчені<br/>смаки з обох боків?"}
    VA -- так --> Z4([0])
    VA -- ні --> EM{немає ні бренду,<br/>ні значущих слів?}
    EM -- так --> Z5([0])
    EM -- ні --> NS["nameSimilarity: (зважений Жаккар + включення) / 2<br/>ваги слів — IDF країни,<br/>слова нечітко: закінчення 0,9, описки Дайс ≥ 0,8"]
    NS --> MUL["score = name × brand × percent × variation"]
    MUL --> OUT([0…1])
```

| Множник | Значення |
|---|---|
| `brand` | той самий — 1; суббренд — 0,8; відомий лише з одного боку — 0,85 |
| `percent` | жирність / міцність вказана лише з одного боку — 0,9 |
| `variation` | вивчена варіація лише з одного боку — 0,85 |

## 5. Що зберігається

```mermaid
flowchart LR
    L[listings<br/>variantId · matchStatus<br/>matchMethod · matchScore · nameTokens] --> PV[product_variants]
    PV --> PR[products]
    PV --> BC[barcodes]
    PV --> MK[match_keys]
    L --> MK
    L --> MC[match_candidates<br/>SUGGESTED / CONFIRMED / REJECTED]
    MC --> PV
    L --> RH[match_rule_hits]
    BA[brand_aliases] -.-> CI((CatalogIndex))
    VO[variation_overrides] -.-> CI
    MRU[matching_rules] -.-> CI
    CI -.звіт пакета.-> RUN[match_runs]
```

| `matchStatus` · `matchMethod` | Рішення |
|---|---|
| `PENDING` | нова картка, ще не зіставлена; або чекає модератора (`review`), або її відвʼязали |
| `AUTO_MATCHED` · `BARCODE` | `barcode` (при інжесті або в пакеті) |
| `AUTO_MATCHED` · `FUZZY` | `fuzzy`, зокрема товар іншої країни |
| `AUTO_MATCHED` · `CREATED` | `variant` або `product`: картка стала основою нового фасування чи товару |
| `CONFIRMED` · `MANUAL` | модератор підтвердив кандидата |

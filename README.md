# OnniMart

Вебсистема моніторингу, агрегації та аналізу цін на споживчі товари.

Система регулярно збирає ціни з сайтів продуктових мереж України та Німеччини і зводить один і той самий товар з різних мереж в один запис каталогу. Це дає змогу:

- порівнювати ціни, зокрема за 1 кг або 1 л;
- стежити за історією цін і знижками;
- надсилати сповіщення про акції на обрані товари;
- показувати ціни в усіх мережах за штрихкодом.

## Структура

| Шлях | Що це |
|---|---|
| `apps/api` | NestJS + Prisma 7 (PostgreSQL): REST API, прийом даних від парсера, каталог |
| `apps/scraper` | Rust-парсер (7 мереж UA/DE): бере завдання з Redis (`scraper:tasks`) і повертає товари та події запуску (`scraper:results`) |
| `apps/web` | Next.js: адмін-UI для перевірки зібраних даних (далі — вебклієнт) |
| `apps/mobile` | Expo: мобільний застосунок зі сканером штрихкодів |
| `packages/shared` | Спільні TypeScript-типи |
| `docs/` | Документація до диплома |

## Документація

1. [Джерела даних і аудит robots.txt](docs/01-data-sources.md) — які мережі можна парсити і за якими правилами.
2. [База даних](docs/02-database.md) — схема, ER-діаграма, алгоритм зіставлення товарів.
3. [План робіт](docs/03-roadmap.md) — етапи до захисту і структура записки.

## Запуск

Потрібні [Bun](https://bun.sh) 1.3+ і Docker Desktop (з WSL 2 на Windows). Rust локально не обов'язковий — парсер збирається в Docker.

```bash
bun install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
bun run infra:up        # PostgreSQL, Redis, Meilisearch і Rust-парсер (воркер)
bun run dev:generate    # Prisma Client
bun run dev:migrate     # міграції
bun run dev:seed        # мережі, категорії, демо-товари
bun run dev:api         # API: http://localhost:3001/api/docs
bun run dev:web         # UI:  http://localhost:3000
```

У UI на сторінці «Огляд» біля кожної мережі є кнопка «Запустити». Режим «1 стор./категорію» — швидка перевірка за кілька хвилин; «Усе» — повний обхід із паузою 3 с між запитами.

Парсер без API (вивід у консоль):

```bash
bun run scraper:cli silpo --max-pages 1 --category napoi
```

Тести:

```bash
bun run test:api        # API (bun test)
bun run scraper:test    # Rust-парсер (cargo test у Docker)
```

Після змін в API-контрактах оновіть клієнт для web: `bun run dev:openapi && bun run dev:orval`.

> Якщо локальна БД уже має стару міграцію `20260829154028_init_schema`, Prisma запропонує скинути базу. Скиньте її командою `cd apps/api && bunx prisma migrate reset` — локальні дані буде видалено.

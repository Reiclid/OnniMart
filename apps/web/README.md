# apps/web — адмінка OnniMart

Next.js (App Router). Робоча заглушка для перевірки даних: огляд мереж і запусків парсера, каталог із порівнянням цін, картки мереж з історією цін, черга модерації зіставлень.

```bash
cp .env.example .env.local   # ADMIN_TOKEN — той самий, що в apps/api/.env
bun run dev                  # http://localhost:3000 (API — http://localhost:3001)
```

- Клієнт API генерує orval з OpenAPI (`src/api/generated`, не редагувати): `bun run dev:openapi && bun run dev:orval` з кореня.
- Зміни (запуск парсингу, модерація) йдуть через серверні дії `src/app/actions.ts`, які додають токен адміністратора на сервері.

-- Готові лічильники каталогу: у скількох мережах продається товар і скільки в нього
-- актуальних карток. Сторінка каталогу читає їх замість GROUP BY по всіх картках на
-- кожен запит; воркер оновлює подання після кожного пакета зіставлення.
CREATE MATERIALIZED VIEW "product_stats" AS
SELECT
  v."productId" AS "productId",
  count(DISTINCT l."chainId")::int AS "chains",
  count(l."id")::int AS "listings"
FROM "product_variants" v
JOIN "listings" l ON l."variantId" = v."id" AND l."delistedAt" IS NULL
GROUP BY v."productId";

-- Унікальний індекс потрібен для REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX "product_stats_productId_key" ON "product_stats" ("productId");
CREATE INDEX "product_stats_rank_idx" ON "product_stats" ("chains" DESC, "listings" DESC);

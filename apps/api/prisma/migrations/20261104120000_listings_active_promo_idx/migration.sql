-- Фільтр каталогу "Акції": без індексу кожен запит сканує всі картки
CREATE INDEX "listings_active_promo_idx" ON "listings" ("variantId") WHERE "isOnPromo" AND "delistedAt" IS NULL;

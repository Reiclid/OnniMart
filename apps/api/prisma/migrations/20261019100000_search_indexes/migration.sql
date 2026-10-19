-- Триграми для пошуку ILIKE '%…%'
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- CreateIndex
CREATE INDEX "brands_name_trgm_idx" ON "brands" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "listings_barcodes_idx" ON "listings" USING GIN ("barcodes");

-- CreateIndex
CREATE INDEX "listings_rawName_trgm_idx" ON "listings" USING GIN ("rawName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "listings_rawBrand_trgm_idx" ON "listings" USING GIN ("rawBrand" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "listings_lastSeenAt_idx" ON "listings"("lastSeenAt" DESC);

-- CreateIndex
CREATE INDEX "price_snapshots_scrapeRunId_idx" ON "price_snapshots"("scrapeRunId");

-- CreateIndex
CREATE INDEX "scrape_runs_startedAt_idx" ON "scrape_runs"("startedAt" DESC);


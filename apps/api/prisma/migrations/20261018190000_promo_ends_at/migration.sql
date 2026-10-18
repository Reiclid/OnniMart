-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "promoEndsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "listings_promoEndsAt_idx" ON "listings"("promoEndsAt");

-- Поточні акції: дата закінчення з останнього запису історії цін
UPDATE "listings" l
SET "promoEndsAt" = s."promoEndsAt"
FROM (
  SELECT DISTINCT ON ("listingId") "listingId", "promoEndsAt"
  FROM "price_snapshots"
  ORDER BY "listingId", "capturedAt" DESC
) s
WHERE s."listingId" = l."id" AND l."isOnPromo";

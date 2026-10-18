-- CreateTable
CREATE TABLE "match_keys" (
    "id" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "listingId" TEXT,

    CONSTRAINT "match_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_keys_key_idx" ON "match_keys"("key");

-- CreateIndex
CREATE INDEX "match_keys_variantId_idx" ON "match_keys"("variantId");

-- CreateIndex
CREATE INDEX "match_keys_listingId_idx" ON "match_keys"("listingId");

-- AddForeignKey
ALTER TABLE "match_keys" ADD CONSTRAINT "match_keys_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_keys" ADD CONSTRAINT "match_keys_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


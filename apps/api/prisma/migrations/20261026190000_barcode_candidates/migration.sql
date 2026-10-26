-- CreateTable
CREATE TABLE "barcode_candidates" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "gtin" VARCHAR(14) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "offName" TEXT NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'SUGGESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "barcode_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "barcode_candidates_status_idx" ON "barcode_candidates"("status");

-- CreateIndex
CREATE UNIQUE INDEX "barcode_candidates_variantId_gtin_key" ON "barcode_candidates"("variantId", "gtin");

-- AddForeignKey
ALTER TABLE "barcode_candidates" ADD CONSTRAINT "barcode_candidates_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


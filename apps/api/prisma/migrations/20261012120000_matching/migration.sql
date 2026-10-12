-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('SUGGESTED', 'ACCEPTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "MatchMethod" ADD VALUE 'CREATED';

-- AlterTable
ALTER TABLE "product_variants" ALTER COLUMN "measure" DROP NOT NULL,
ALTER COLUMN "netQuantity" DROP NOT NULL;

-- CreateTable
CREATE TABLE "match_candidates" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "details" JSONB,
    "status" "CandidateStatus" NOT NULL DEFAULT 'SUGGESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "match_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_candidates_status_idx" ON "match_candidates"("status");

-- CreateIndex
CREATE INDEX "match_candidates_variantId_idx" ON "match_candidates"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "match_candidates_listingId_variantId_key" ON "match_candidates"("listingId", "variantId");

-- AddForeignKey
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


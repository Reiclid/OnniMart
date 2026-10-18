-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "nameTokens" TEXT[],
ADD COLUMN     "tokenizedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "listings_tokenizedAt_idx" ON "listings"("tokenizedAt");


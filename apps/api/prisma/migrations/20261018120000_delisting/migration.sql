-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "delistedAt" TIMESTAMP(3),
ADD COLUMN     "lastRunId" TEXT;

-- AlterTable
ALTER TABLE "scrape_runs" ADD COLUMN     "maxPages" INTEGER;

-- CreateIndex
CREATE INDEX "listings_chainId_lastRunId_idx" ON "listings"("chainId", "lastRunId");


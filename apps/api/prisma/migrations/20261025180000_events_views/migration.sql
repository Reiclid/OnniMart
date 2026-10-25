-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('IMPRESSION', 'CLICK', 'VIEW', 'CHAIN_CLICK', 'FAVOURITE', 'TRACK', 'SEARCH', 'FILTER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "telemetryConsentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "product_views" (
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_views_pkey" PRIMARY KEY ("userId","productId")
);

-- CreateTable
CREATE TABLE "events" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT,
    "anonId" UUID,
    "sessionId" UUID NOT NULL,
    "type" "EventType" NOT NULL,
    "productId" TEXT,
    "chainId" TEXT,
    "query" TEXT,
    "position" INTEGER,
    "listId" TEXT,
    "country" CHAR(2),
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_views_userId_viewedAt_idx" ON "product_views"("userId", "viewedAt");

-- CreateIndex
CREATE INDEX "product_views_productId_idx" ON "product_views"("productId");

-- CreateIndex
CREATE INDEX "events_createdAt_idx" ON "events"("createdAt");

-- CreateIndex
CREATE INDEX "events_userId_createdAt_idx" ON "events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "events_anonId_createdAt_idx" ON "events"("anonId", "createdAt");

-- AddForeignKey
ALTER TABLE "product_views" ADD CONSTRAINT "product_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_views" ADD CONSTRAINT "product_views_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Подія належить рівно одному: акаунту або гостю
ALTER TABLE "events" ADD CONSTRAINT "events_owner_check" CHECK (num_nonnulls("userId", "anonId") = 1);

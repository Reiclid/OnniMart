-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('UAH', 'EUR', 'PLN', 'USD');

-- CreateEnum
CREATE TYPE "Measure" AS ENUM ('MASS', 'VOLUME', 'COUNT');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'AUTO_MATCHED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('BARCODE', 'FUZZY', 'MANUAL');

-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('DISCOUNT', 'MULTIBUY', 'LOYALTY');

-- CreateEnum
CREATE TYPE "ScrapeStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PRICE_DROP', 'PROMO_STARTED', 'TARGET_PRICE_REACHED', 'BACK_IN_STOCK');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'IN_APP');

-- CreateTable
CREATE TABLE "countries" (
    "code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "store_chains" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "logoUrl" TEXT,
    "countryCode" CHAR(2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "scrapeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "crawlDelayMs" INTEGER NOT NULL DEFAULT 3000,
    "robotsCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "manufacturer" TEXT,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_lines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brandId" TEXT,

    CONSTRAINT "product_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "variantLabel" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "attributes" JSONB,
    "lineId" TEXT,
    "brandId" TEXT,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "measure" "Measure" NOT NULL,
    "netQuantity" DECIMAL(12,3) NOT NULL,
    "packCount" INTEGER NOT NULL DEFAULT 1,
    "isWeighted" BOOLEAN NOT NULL DEFAULT false,
    "packaging" TEXT,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barcodes" (
    "gtin" VARCHAR(14) NOT NULL,
    "variantId" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barcodes_pkey" PRIMARY KEY ("gtin")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "rawName" TEXT NOT NULL,
    "rawBrand" TEXT,
    "rawCategory" TEXT,
    "imageUrl" TEXT,
    "barcodes" TEXT[],
    "rawData" JSONB,
    "measure" "Measure",
    "netQuantity" DECIMAL(12,3),
    "packCount" INTEGER,
    "isWeighted" BOOLEAN NOT NULL DEFAULT false,
    "variantId" TEXT,
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "matchMethod" "MatchMethod",
    "matchScore" DOUBLE PRECISION,
    "matchedAt" TIMESTAMP(3),
    "currentPrice" DECIMAL(12,2),
    "regularPrice" DECIMAL(12,2),
    "unitPrice" DECIMAL(12,2),
    "isOnPromo" BOOLEAN NOT NULL DEFAULT false,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "listingId" TEXT NOT NULL,
    "storeId" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "regularPrice" DECIMAL(12,2),
    "unitPrice" DECIMAL(12,2),
    "promoType" "PromoType",
    "promoLabel" TEXT,
    "promoEndsAt" TIMESTAMP(3),
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scrapeRunId" TEXT,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrape_runs" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "status" "ScrapeStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "itemsSeen" INTEGER NOT NULL DEFAULT 0,
    "itemsChanged" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "scrape_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'uk',
    "countryCode" CHAR(2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "chainIds" TEXT[],
    "targetPrice" DECIMAL(12,2),
    "notifyOnPromo" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'PUSH',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_chains_slug_key" ON "store_chains"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "stores_chainId_externalId_key" ON "stores"("chainId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "product_lines_slug_key" ON "product_lines"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_lineId_idx" ON "products"("lineId");

-- CreateIndex
CREATE INDEX "products_brandId_idx" ON "products"("brandId");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_productId_measure_netQuantity_packCount_key" ON "product_variants"("productId", "measure", "netQuantity", "packCount");

-- CreateIndex
CREATE INDEX "barcodes_variantId_idx" ON "barcodes"("variantId");

-- CreateIndex
CREATE INDEX "listings_variantId_idx" ON "listings"("variantId");

-- CreateIndex
CREATE INDEX "listings_matchStatus_idx" ON "listings"("matchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "listings_chainId_externalId_key" ON "listings"("chainId", "externalId");

-- CreateIndex
CREATE INDEX "price_snapshots_listingId_capturedAt_idx" ON "price_snapshots"("listingId", "capturedAt" DESC);

-- CreateIndex
CREATE INDEX "scrape_runs_chainId_startedAt_idx" ON "scrape_runs"("chainId", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "subscriptions_productId_idx" ON "subscriptions"("productId");

-- CreateIndex
CREATE INDEX "subscriptions_variantId_idx" ON "subscriptions"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_productId_key" ON "subscriptions"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_variantId_key" ON "subscriptions"("userId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_expoPushToken_key" ON "push_devices"("expoPushToken");

-- CreateIndex
CREATE INDEX "push_devices_userId_idx" ON "push_devices"("userId");

-- AddForeignKey
ALTER TABLE "store_chains" ADD CONSTRAINT "store_chains_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "store_chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_lines" ADD CONSTRAINT "product_lines_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "product_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barcodes" ADD CONSTRAINT "barcodes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "store_chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "scrape_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "store_chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Підписка — або на продукт (будь-яке фасування), або на конкретне фасування, але не на обидва
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_target_check" CHECK (("productId" IS NULL) <> ("variantId" IS NULL));

-- Валюта: з enum (4 значення) на код ISO 4217, щоб додати мережі з усього світу.
-- Тип колонки змінюється на місці, дані зберігаються.
ALTER TABLE "countries" ALTER COLUMN "currency" TYPE CHAR(3) USING "currency"::text;
ALTER TABLE "store_chains" ALTER COLUMN "currency" TYPE CHAR(3) USING "currency"::text;
DROP TYPE "Currency";

-- CreateEnum
CREATE TYPE "ChainStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANDIDATE', 'RULED_OUT');

-- CreateEnum
CREATE TYPE "OnlinePrices" AS ENUM ('FULL', 'PARTIAL', 'UNKNOWN');

-- AlterTable
ALTER TABLE "store_chains" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "onlinePrices" "OnlinePrices" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "status" "ChainStatus" NOT NULL DEFAULT 'CANDIDATE';

-- Мережі, що вже парсяться
UPDATE "store_chains" SET "status" = 'ACTIVE' WHERE "scrapeEnabled";

-- CreateIndex
CREATE INDEX "store_chains_countryCode_idx" ON "store_chains"("countryCode");

-- CreateIndex
CREATE INDEX "store_chains_status_idx" ON "store_chains"("status");

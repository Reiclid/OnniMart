-- CreateEnum
CREATE TYPE "VariationAction" AS ENUM ('ADD', 'REMOVE');

-- CreateTable
CREATE TABLE "variation_overrides" (
    "word" TEXT NOT NULL,
    "action" "VariationAction" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variation_overrides_pkey" PRIMARY KEY ("word")
);


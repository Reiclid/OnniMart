-- CreateTable
CREATE TABLE "food_facts" (
    "gtin" VARCHAR(14) NOT NULL,
    "productName" TEXT,
    "ingredients" TEXT,
    "allergens" TEXT[],
    "labels" TEXT[],
    "categories" TEXT[],
    "analysis" TEXT[],
    "nutriments" JSONB,
    "nutriscore" CHAR(1),
    "nova" INTEGER,
    "offModifiedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_facts_pkey" PRIMARY KEY ("gtin")
);


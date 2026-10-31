-- CreateTable
CREATE TABLE "brand_aliases" (
    "alias" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_aliases_pkey" PRIMARY KEY ("alias")
);

-- CreateIndex
CREATE INDEX "brand_aliases_brandId_idx" ON "brand_aliases"("brandId");

-- AddForeignKey
ALTER TABLE "brand_aliases" ADD CONSTRAINT "brand_aliases_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;


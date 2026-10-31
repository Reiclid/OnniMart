-- AlterTable
ALTER TABLE "products" ADD COLUMN     "imageLocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "food_facts" ADD COLUMN     "brands" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "quantity" TEXT;


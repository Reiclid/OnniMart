-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currencyCode" CHAR(3);

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "currency" CHAR(3);

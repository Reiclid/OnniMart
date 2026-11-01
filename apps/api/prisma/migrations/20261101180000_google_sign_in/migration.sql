-- Вхід через Google: користувач знаходиться за незмінним sub, а не за email
ALTER TABLE "users" ADD COLUMN "googleSub" TEXT;

CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");

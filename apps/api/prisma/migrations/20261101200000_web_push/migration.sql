-- Web Push: браузер як пристрій для push поруч з Expo-токеном мобільного застосунку
ALTER TABLE "push_devices" ALTER COLUMN "expoPushToken" DROP NOT NULL;
ALTER TABLE "push_devices" ADD COLUMN "endpoint" TEXT,
ADD COLUMN "p256dh" TEXT,
ADD COLUMN "auth" TEXT,
ADD COLUMN "label" TEXT;

CREATE UNIQUE INDEX "push_devices_endpoint_key" ON "push_devices"("endpoint");

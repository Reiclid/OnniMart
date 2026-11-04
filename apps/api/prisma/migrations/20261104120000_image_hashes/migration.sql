-- CreateTable
CREATE TABLE "image_hashes" (
    "key" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_hashes_pkey" PRIMARY KEY ("key")
);


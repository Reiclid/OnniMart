-- CreateTable
CREATE TABLE "match_runs" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "processed" INTEGER NOT NULL,
    "byBarcode" INTEGER NOT NULL,
    "fuzzy" INTEGER NOT NULL,
    "review" INTEGER NOT NULL,
    "newVariants" INTEGER NOT NULL,
    "newProducts" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,

    CONSTRAINT "match_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_runs_startedAt_idx" ON "match_runs"("startedAt" DESC);


-- CreateTable
CREATE TABLE "matching_rules" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matching_rules_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "match_rule_hits" (
    "id" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_rule_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_rule_hits_rule_createdAt_idx" ON "match_rule_hits"("rule", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "match_rule_hits_listingId_idx" ON "match_rule_hits"("listingId");

-- AddForeignKey
ALTER TABLE "match_rule_hits" ADD CONSTRAINT "match_rule_hits_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


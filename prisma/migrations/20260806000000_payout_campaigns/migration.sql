-- Limited-time payout multiplier campaigns ("3x PPT this sprint"), spanning
-- all three earning paths: PPT payouts, monthly bonus caps, and incentive
-- awards. Campaigns never stack — the highest multiplier wins.
--
-- Two invariants are encoded here:
--   * PayoutCampaignApplication is the uplift ledger AND the idempotency key.
--     The unique (campaignId, scope, entityId) makes a replayed Linear webhook
--     charge the pool exactly once.
--   * Transaction.baseAmount is the pre-multiplier amount. The weekly credit
--     limit aggregates that column, never "amount", so a promo cannot push
--     developers past their auto-approval limit. Existing rows are backfilled
--     to their current amount so the aggregate is correct from the first run.

-- CreateEnum
CREATE TYPE "PayoutCampaignScope" AS ENUM ('PPT', 'BONUS', 'INCENTIVE');

-- CreateTable
CREATE TABLE "PayoutCampaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "scopes" "PayoutCampaignScope"[],
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "includedLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ranks" "DeveloperRank"[] DEFAULT ARRAY[]::"DeveloperRank"[],
    "participantUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "upliftPoolMyr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "upliftPoolRobux" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perUserUpliftCapMyr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perUserUpliftCapRobux" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditLimitOnBaseAmount" BOOLEAN NOT NULL DEFAULT true,
    "headline" TEXT NOT NULL,
    "body" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT 'violet',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutCampaignApplication" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "scope" "PayoutCampaignScope" NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "upliftAmount" DOUBLE PRECISION NOT NULL,
    "reverted" BOOLEAN NOT NULL DEFAULT false,
    "revertedAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutCampaignApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutCampaign_slug_key" ON "PayoutCampaign"("slug");
CREATE INDEX "PayoutCampaign_enabled_startsAt_endsAt_idx" ON "PayoutCampaign"("enabled", "startsAt", "endsAt");
CREATE UNIQUE INDEX "PayoutCampaignApplication_campaignId_scope_entityId_key" ON "PayoutCampaignApplication"("campaignId", "scope", "entityId");
CREATE INDEX "PayoutCampaignApplication_campaignId_currency_reverted_idx" ON "PayoutCampaignApplication"("campaignId", "currency", "reverted");
CREATE INDEX "PayoutCampaignApplication_userId_campaignId_currency_idx" ON "PayoutCampaignApplication"("userId", "campaignId", "currency");
CREATE INDEX "PayoutCampaignApplication_transactionId_idx" ON "PayoutCampaignApplication"("transactionId");

-- AddForeignKey
ALTER TABLE "PayoutCampaign" ADD CONSTRAINT "PayoutCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayoutCampaignApplication" ADD CONSTRAINT "PayoutCampaignApplication_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PayoutCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayoutCampaignApplication" ADD CONSTRAINT "PayoutCampaignApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayoutCampaignApplication" ADD CONSTRAINT "PayoutCampaignApplication_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: campaign attribution on the money rows. All nullable so existing
-- rows stay valid; "outside a campaign" is represented by NULL, not 1.
ALTER TABLE "Transaction"
  ADD COLUMN "baseAmount" DOUBLE PRECISION,
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "campaignMultiplier" DOUBLE PRECISION;

ALTER TABLE "BonusCandidate"
  ADD COLUMN "baseMaxAmount" DOUBLE PRECISION,
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "campaignMultiplier" DOUBLE PRECISION;

ALTER TABLE "IncentiveAward"
  ADD COLUMN "baseAmount" DOUBLE PRECISION,
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "campaignMultiplier" DOUBLE PRECISION;

-- AlterTable: the campaign locked in at first payout eligibility. Recompute
-- paths (estimate changed, ON_HOLD release) read this instead of re-resolving
-- against the clock, so an expiring campaign never reprices a live payout.
ALTER TABLE "PptPayoutState"
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "campaignMultiplier" DOUBLE PRECISION;

-- Backfill: every pre-campaign row was paid at 1x, so its base equals its
-- amount. Required before the weekly credit limit starts aggregating
-- baseAmount, otherwise historical usage in the current week reads as zero.
UPDATE "Transaction" SET "baseAmount" = "amount" WHERE "baseAmount" IS NULL;
UPDATE "BonusCandidate" SET "baseMaxAmount" = "maxAmount" WHERE "baseMaxAmount" IS NULL;
UPDATE "IncentiveAward" SET "baseAmount" = "amount" WHERE "baseAmount" IS NULL;

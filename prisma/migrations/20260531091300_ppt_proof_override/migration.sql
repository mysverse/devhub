ALTER TYPE "PptPayoutEventType" ADD VALUE IF NOT EXISTS 'PROOF_OVERRIDDEN';

ALTER TABLE "PptPayoutState"
ADD COLUMN "proofOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "proofOverrideById" TEXT,
ADD COLUMN "proofOverrideAt" TIMESTAMP(3),
ADD COLUMN "proofOverrideNote" TEXT,
ADD COLUMN "proofOverrideEpisode" INTEGER;

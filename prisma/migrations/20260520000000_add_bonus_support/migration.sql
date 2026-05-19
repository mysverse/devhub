CREATE TYPE "TransactionSource" AS ENUM ('PPT', 'BONUS', 'MANUAL');

CREATE TYPE "BonusCandidateStatus" AS ENUM ('ELIGIBLE', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'INELIGIBLE');

CREATE TYPE "BonusNotificationType" AS ENUM ('NEW_ELIGIBLE_BONUS');

ALTER TABLE "Transaction"
ADD COLUMN "source" "TransactionSource" NOT NULL DEFAULT 'PPT',
ADD COLUMN "bonusPeriod" TEXT;

CREATE TABLE "BonusConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "myrRatePerPoint" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "robuxRatePerPoint" DOUBLE PRECISION NOT NULL DEFAULT 1200,
  "excludedLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BonusConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BonusConfig" (
  "id",
  "enabled",
  "myrRatePerPoint",
  "robuxRatePerPoint",
  "excludedLabels",
  "createdAt",
  "updatedAt"
)
VALUES (
  'default',
  true,
  20,
  1200,
  ARRAY['Redistributable', 'Redistributed']::TEXT[],
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "BonusCandidate" (
  "id" TEXT NOT NULL,
  "linearIssueId" TEXT NOT NULL,
  "linearIssueIdentifier" TEXT,
  "linearIssueTitle" TEXT,
  "linearIssueUrl" TEXT,
  "linearIssueStateType" TEXT,
  "linearIssueStateName" TEXT,
  "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "estimate" INTEGER,
  "userId" TEXT,
  "assigneeLinearId" TEXT,
  "assigneeEmail" TEXT,
  "assigneeName" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'MYR',
  "maxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "approvedAmount" DOUBLE PRECISION,
  "status" "BonusCandidateStatus" NOT NULL DEFAULT 'INELIGIBLE',
  "ineligibilityReason" TEXT,
  "period" TEXT,
  "completedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "transactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BonusCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BonusNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "type" "BonusNotificationType" NOT NULL DEFAULT 'NEW_ELIGIBLE_BONUS',
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BonusNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BonusCandidate_linearIssueId_key" ON "BonusCandidate"("linearIssueId");
CREATE INDEX "BonusCandidate_userId_status_idx" ON "BonusCandidate"("userId", "status");
CREATE INDEX "BonusCandidate_period_status_idx" ON "BonusCandidate"("period", "status");
CREATE INDEX "BonusCandidate_transactionId_idx" ON "BonusCandidate"("transactionId");
CREATE UNIQUE INDEX "BonusNotification_userId_candidateId_type_key" ON "BonusNotification"("userId", "candidateId", "type");
CREATE INDEX "BonusNotification_userId_readAt_idx" ON "BonusNotification"("userId", "readAt");

ALTER TABLE "BonusCandidate"
ADD CONSTRAINT "BonusCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BonusCandidate"
ADD CONSTRAINT "BonusCandidate_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BonusCandidate"
ADD CONSTRAINT "BonusCandidate_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BonusNotification"
ADD CONSTRAINT "BonusNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BonusNotification"
ADD CONSTRAINT "BonusNotification_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "BonusCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

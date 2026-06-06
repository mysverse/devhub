ALTER TYPE "TransactionSource" ADD VALUE 'INCENTIVE';

CREATE TYPE "IncentiveType" AS ENUM (
  'WEEKLY_THROUGHPUT',
  'STREAK',
  'MILESTONE',
  'LEADERBOARD'
);

CREATE TYPE "IncentiveAwardStatus" AS ENUM (
  'PENDING',
  'HELD',
  'RELEASING',
  'TRANSACTION_PENDING',
  'PAID',
  'CANCELLED',
  'CLAWBACK_REQUESTED',
  'SETTLED_BY_CLAWBACK'
);

CREATE TYPE "IncentiveNotificationType" AS ENUM (
  'NEW_INCENTIVE',
  'INCENTIVE_DISPUTED'
);

CREATE TYPE "IncentiveClawbackMode" AS ENUM (
  'NET_NEXT',
  'MANUAL_ADJUSTMENT'
);

CREATE TYPE "IncentiveClawbackStatus" AS ENUM (
  'OPEN',
  'SETTLED',
  'MANUAL_ADJUSTMENT'
);

CREATE TABLE "IncentiveConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "activatedAt" TIMESTAMP(3),
  "weeklyEnabled" BOOLEAN NOT NULL DEFAULT true,
  "weeklyThreshold" INTEGER NOT NULL DEFAULT 5,
  "weeklyMyrAmount" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "weeklyRobuxAmount" DOUBLE PRECISION NOT NULL DEFAULT 1800,
  "weeklyTiers" JSONB,
  "streakEnabled" BOOLEAN NOT NULL DEFAULT true,
  "streakThresholdWeeks" INTEGER NOT NULL DEFAULT 4,
  "streakMyrAmount" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "streakRobuxAmount" DOUBLE PRECISION NOT NULL DEFAULT 3000,
  "milestoneEnabled" BOOLEAN NOT NULL DEFAULT true,
  "milestones" JSONB,
  "leaderboardEnabled" BOOLEAN NOT NULL DEFAULT true,
  "leaderboardTopN" INTEGER NOT NULL DEFAULT 3,
  "leaderboardMyrAmount" DOUBLE PRECISION NOT NULL DEFAULT 40,
  "leaderboardRobuxAmount" DOUBLE PRECISION NOT NULL DEFAULT 2400,
  "activeDayKickerEnabled" BOOLEAN NOT NULL DEFAULT false,
  "activeDayThreshold" INTEGER NOT NULL DEFAULT 3,
  "activeDayKickerMyr" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "activeDayKickerRobux" DOUBLE PRECISION NOT NULL DEFAULT 300,
  "minEstimateToCount" INTEGER NOT NULL DEFAULT 1,
  "excludedLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "stabilityMinutes" INTEGER NOT NULL DEFAULT 60,
  "disputeWindowHours" INTEGER NOT NULL DEFAULT 48,
  "autoPayout" BOOLEAN NOT NULL DEFAULT true,
  "perUserWeeklyCapMyr" DOUBLE PRECISION NOT NULL DEFAULT 150,
  "perUserWeeklyCapRobux" DOUBLE PRECISION NOT NULL DEFAULT 9000,
  "perUserMonthlyCapMyr" DOUBLE PRECISION NOT NULL DEFAULT 400,
  "perUserMonthlyCapRobux" DOUBLE PRECISION NOT NULL DEFAULT 24000,
  "programWeeklyBudgetMyr" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "programWeeklyBudgetRobux" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "programMonthlyBudgetMyr" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "programMonthlyBudgetRobux" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "anomalyMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 3,
  "anomalyMinBaselineWeeks" INTEGER NOT NULL DEFAULT 2,
  "noEstimateRatioFlag" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "clawbackMode" "IncentiveClawbackMode" NOT NULL DEFAULT 'NET_NEXT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncentiveConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "IncentiveConfig" ("id", "createdAt", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "IssueCompletion" (
  "id" TEXT NOT NULL,
  "linearIssueId" TEXT NOT NULL,
  "linearIssueIdentifier" TEXT,
  "linearIssueTitle" TEXT,
  "linearIssueUrl" TEXT,
  "userId" TEXT,
  "assigneeLinearId" TEXT,
  "assigneeEmail" TEXT,
  "assigneeName" TEXT,
  "assigneeAtCompletion" TEXT,
  "estimate" INTEGER,
  "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "hasPptLabel" BOOLEAN NOT NULL DEFAULT false,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "observedCompletedAt" TIMESTAMP(3),
  "linearCompletedAt" TIMESTAMP(3),
  "completionEpisode" INTEGER NOT NULL DEFAULT 0,
  "countedInWeek" TEXT,
  "weekKey" TEXT,
  "latestLinearStateType" TEXT,
  "latestLinearStateName" TEXT,
  "latestLinearUpdatedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "trashed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IssueCompletion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncentiveAward" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "IncentiveType" NOT NULL,
  "period" TEXT NOT NULL,
  "thresholdMet" INTEGER NOT NULL,
  "detail" JSONB,
  "amount" DOUBLE PRECISION NOT NULL,
  "netAmount" DOUBLE PRECISION,
  "clawbackApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'MYR',
  "status" "IncentiveAwardStatus" NOT NULL DEFAULT 'PENDING',
  "heldReason" TEXT,
  "transactionId" TEXT,
  "releaseAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "releaseClaimId" TEXT,
  "disputedById" TEXT,
  "disputedAt" TIMESTAMP(3),
  "disputeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncentiveAward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncentiveAwardIssue" (
  "id" TEXT NOT NULL,
  "awardId" TEXT NOT NULL,
  "issueCompletionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncentiveAwardIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncentiveNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "awardId" TEXT NOT NULL,
  "type" "IncentiveNotificationType" NOT NULL DEFAULT 'NEW_INCENTIVE',
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncentiveNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncentiveEvent" (
  "id" TEXT NOT NULL,
  "awardId" TEXT,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "period" TEXT,
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncentiveEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserActivityDay" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "activityDate" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserActivityDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncentiveClawbackDebt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'MYR',
  "originalAwardId" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "remainingAmount" DOUBLE PRECISION NOT NULL,
  "status" "IncentiveClawbackStatus" NOT NULL DEFAULT 'OPEN',
  "reason" TEXT,
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncentiveClawbackDebt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IssueCompletion_linearIssueId_key" ON "IssueCompletion"("linearIssueId");
CREATE INDEX "IssueCompletion_userId_weekKey_idx" ON "IssueCompletion"("userId", "weekKey");
CREATE INDEX "IssueCompletion_weekKey_completed_idx" ON "IssueCompletion"("weekKey", "completed");
CREATE INDEX "IssueCompletion_observedCompletedAt_idx" ON "IssueCompletion"("observedCompletedAt");
CREATE INDEX "IssueCompletion_latestLinearUpdatedAt_idx" ON "IssueCompletion"("latestLinearUpdatedAt");

CREATE UNIQUE INDEX "IncentiveAward_userId_type_period_key" ON "IncentiveAward"("userId", "type", "period");
CREATE INDEX "IncentiveAward_userId_status_idx" ON "IncentiveAward"("userId", "status");
CREATE INDEX "IncentiveAward_status_releaseAt_idx" ON "IncentiveAward"("status", "releaseAt");
CREATE INDEX "IncentiveAward_transactionId_idx" ON "IncentiveAward"("transactionId");

CREATE UNIQUE INDEX "IncentiveAwardIssue_awardId_issueCompletionId_key" ON "IncentiveAwardIssue"("awardId", "issueCompletionId");
CREATE INDEX "IncentiveAwardIssue_issueCompletionId_idx" ON "IncentiveAwardIssue"("issueCompletionId");

CREATE UNIQUE INDEX "IncentiveNotification_userId_awardId_type_key" ON "IncentiveNotification"("userId", "awardId", "type");
CREATE INDEX "IncentiveNotification_userId_readAt_idx" ON "IncentiveNotification"("userId", "readAt");

CREATE INDEX "IncentiveEvent_userId_createdAt_idx" ON "IncentiveEvent"("userId", "createdAt");
CREATE INDEX "IncentiveEvent_awardId_createdAt_idx" ON "IncentiveEvent"("awardId", "createdAt");
CREATE INDEX "IncentiveEvent_type_createdAt_idx" ON "IncentiveEvent"("type", "createdAt");

CREATE UNIQUE INDEX "UserActivityDay_userId_activityDate_key" ON "UserActivityDay"("userId", "activityDate");
CREATE INDEX "UserActivityDay_userId_activityDate_idx" ON "UserActivityDay"("userId", "activityDate");

CREATE INDEX "IncentiveClawbackDebt_userId_currency_status_idx" ON "IncentiveClawbackDebt"("userId", "currency", "status");
CREATE INDEX "IncentiveClawbackDebt_originalAwardId_idx" ON "IncentiveClawbackDebt"("originalAwardId");

ALTER TABLE "IssueCompletion"
ADD CONSTRAINT "IssueCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IncentiveAward"
ADD CONSTRAINT "IncentiveAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IncentiveAward"
ADD CONSTRAINT "IncentiveAward_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IncentiveAward"
ADD CONSTRAINT "IncentiveAward_disputedById_fkey" FOREIGN KEY ("disputedById") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IncentiveAwardIssue"
ADD CONSTRAINT "IncentiveAwardIssue_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "IncentiveAward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IncentiveAwardIssue"
ADD CONSTRAINT "IncentiveAwardIssue_issueCompletionId_fkey" FOREIGN KEY ("issueCompletionId") REFERENCES "IssueCompletion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IncentiveNotification"
ADD CONSTRAINT "IncentiveNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IncentiveNotification"
ADD CONSTRAINT "IncentiveNotification_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "IncentiveAward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IncentiveEvent"
ADD CONSTRAINT "IncentiveEvent_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "IncentiveAward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserActivityDay"
ADD CONSTRAINT "UserActivityDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IncentiveClawbackDebt"
ADD CONSTRAINT "IncentiveClawbackDebt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IncentiveClawbackDebt"
ADD CONSTRAINT "IncentiveClawbackDebt_originalAwardId_fkey" FOREIGN KEY ("originalAwardId") REFERENCES "IncentiveAward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

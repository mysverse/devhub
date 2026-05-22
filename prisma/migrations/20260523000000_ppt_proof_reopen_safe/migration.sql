ALTER TYPE "TxStatus" ADD VALUE 'ON_HOLD';

CREATE TYPE "PptPayoutStatus" AS ENUM (
  'BLOCKED',
  'NEEDS_PROOF',
  'WAITING_STABILITY',
  'READY_FOR_PAYOUT',
  'TRANSACTION_PENDING',
  'ON_HOLD',
  'PAID',
  'FLAGGED'
);

CREATE TYPE "PptPayoutReason" AS ENUM (
  'MISSING_PPT_LABEL',
  'NOT_COMPLETED',
  'MISSING_ESTIMATE',
  'MISSING_ASSIGNEE',
  'NO_LINKED_USER',
  'MISSING_PROOF',
  'PROOF_RESET_BY_QUESTION',
  'WAITING_STABILITY',
  'DUPLICATE_TRANSACTION',
  'APPROVED_BONUS_EXISTS',
  'LINEAR_API_ERROR',
  'REOPENED_BEFORE_PAYOUT',
  'REOPENED_DURING_PAYOUT_PROCESSING',
  'PAID_ISSUE_REOPENED',
  'READY_FOR_PAYOUT',
  'TRANSACTION_CREATED',
  'AUTO_PAYOUT_STARTED'
);

CREATE TYPE "PptPayoutEventType" AS ENUM (
  'COMPLETED_DETECTED',
  'REOPENED_DETECTED',
  'PROOF_MISSING',
  'PROOF_ACCEPTED',
  'PROOF_RESET',
  'WAITING_STABILITY',
  'PAYOUT_BLOCKED',
  'PAYOUT_HELD',
  'PAYOUT_RESUMED',
  'PAYOUT_READY',
  'TRANSACTION_CREATED',
  'AUTO_PAYOUT_STARTED',
  'PAID_ISSUE_REOPENED',
  'DUPLICATE_SUPPRESSED',
  'LINEAR_COMMENTED',
  'DEVELOPER_NOTIFIED',
  'ADMIN_ALERT_SENT'
);

CREATE TYPE "PptNotificationType" AS ENUM (
  'BLOCKED',
  'HELD',
  'READY',
  'PROOF_ACCEPTED',
  'PAID_REOPENED'
);

CREATE TABLE "PptPayoutState" (
  "id" TEXT NOT NULL,
  "linearIssueId" TEXT NOT NULL,
  "linearIssueIdentifier" TEXT,
  "linearIssueTitle" TEXT,
  "linearIssueUrl" TEXT,
  "latestLinearStateType" TEXT,
  "latestLinearStateName" TEXT,
  "hasPptLabel" BOOLEAN NOT NULL DEFAULT false,
  "estimate" INTEGER,
  "userId" TEXT,
  "assigneeLinearId" TEXT,
  "assigneeEmail" TEXT,
  "assigneeName" TEXT,
  "status" "PptPayoutStatus" NOT NULL DEFAULT 'BLOCKED',
  "reason" "PptPayoutReason",
  "completionEpisode" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "lastReopenedAt" TIMESTAMP(3),
  "latestAssignmentAt" TIMESTAMP(3),
  "proofCommentId" TEXT,
  "proofCommentUrl" TEXT,
  "proofCommentBody" TEXT,
  "proofAuthorLinearId" TEXT,
  "proofProvidedAt" TIMESTAMP(3),
  "transactionId" TEXT,
  "warningCount" INTEGER NOT NULL DEFAULT 0,
  "lastDeveloperNotifiedAt" TIMESTAMP(3),
  "lastAdminNotifiedAt" TIMESTAMP(3),
  "lastLinearCommentReason" "PptPayoutReason",
  "lastLinearCommentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PptPayoutState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PptPayoutEvent" (
  "id" TEXT NOT NULL,
  "stateId" TEXT NOT NULL,
  "linearIssueId" TEXT NOT NULL,
  "type" "PptPayoutEventType" NOT NULL,
  "reason" "PptPayoutReason",
  "actorLinearId" TEXT,
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PptPayoutEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PptNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stateId" TEXT NOT NULL,
  "type" "PptNotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PptNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PptPayoutState_linearIssueId_key" ON "PptPayoutState"("linearIssueId");
CREATE UNIQUE INDEX "PptPayoutState_transactionId_key" ON "PptPayoutState"("transactionId");
CREATE INDEX "PptPayoutState_status_reason_idx" ON "PptPayoutState"("status", "reason");
CREATE INDEX "PptPayoutState_userId_status_idx" ON "PptPayoutState"("userId", "status");
CREATE INDEX "PptPayoutState_completedAt_idx" ON "PptPayoutState"("completedAt");

CREATE INDEX "PptPayoutEvent_stateId_createdAt_idx" ON "PptPayoutEvent"("stateId", "createdAt");
CREATE INDEX "PptPayoutEvent_linearIssueId_createdAt_idx" ON "PptPayoutEvent"("linearIssueId", "createdAt");
CREATE INDEX "PptPayoutEvent_type_createdAt_idx" ON "PptPayoutEvent"("type", "createdAt");

CREATE INDEX "PptNotification_userId_readAt_idx" ON "PptNotification"("userId", "readAt");
CREATE INDEX "PptNotification_stateId_createdAt_idx" ON "PptNotification"("stateId", "createdAt");

ALTER TABLE "PptPayoutState"
ADD CONSTRAINT "PptPayoutState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PptPayoutState"
ADD CONSTRAINT "PptPayoutState_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PptPayoutEvent"
ADD CONSTRAINT "PptPayoutEvent_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "PptPayoutState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PptNotification"
ADD CONSTRAINT "PptNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PptNotification"
ADD CONSTRAINT "PptNotification_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "PptPayoutState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

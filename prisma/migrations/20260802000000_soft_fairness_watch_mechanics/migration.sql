-- Soft fairness mechanics for the PPT assignment watch: a self-service
-- BLOCKED state that pauses the stale clock (time-boxed, auto-expiring),
-- claim/release/takeover provenance, idle-nudge tracking, and a per-watch
-- audit event trail powering developer-visible history and admin rollups.

-- AlterEnum: developer-facing paused state (safe in a transaction on PG 12+
-- because the new value is not used within this migration)
ALTER TYPE "PptAssignmentWatchStatus" ADD VALUE 'BLOCKED';

-- CreateEnum
CREATE TYPE "PptSelfBlockReason" AS ENUM ('WAITING_REVIEW', 'WAITING_ASSETS', 'WAITING_DEPENDENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "PptWatchEventType" AS ENUM ('CLAIMED', 'RELEASED', 'REASSIGNED_TAKEN', 'REASSIGNED_AWAY', 'IDLE_NUDGE', 'WARNED', 'AUTO_UNASSIGNED', 'BLOCKED', 'UNBLOCKED', 'BLOCK_EXPIRED', 'ADMIN_SNOOZE', 'ADMIN_ACTIVATE', 'ADMIN_FORCE_UNASSIGN');

-- AlterTable
ALTER TABLE "PptAssignmentWatch"
  ADD COLUMN "selfBlockedAt" TIMESTAMP(3),
  ADD COLUMN "selfBlockReason" "PptSelfBlockReason",
  ADD COLUMN "selfBlockNote" TEXT,
  ADD COLUMN "selfBlockExpiresAt" TIMESTAMP(3),
  ADD COLUMN "selfBlockCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "releasedBySelfAt" TIMESTAMP(3),
  ADD COLUMN "idleNudgedAt" TIMESTAMP(3),
  ADD COLUMN "reassignedFromLinearId" TEXT,
  ADD COLUMN "reassignReason" TEXT;

-- CreateIndex
CREATE INDEX "PptAssignmentWatch_status_selfBlockExpiresAt_idx" ON "PptAssignmentWatch"("status", "selfBlockExpiresAt");

-- CreateTable
CREATE TABLE "PptAssignmentWatchEvent" (
    "id" TEXT NOT NULL,
    "watchId" TEXT NOT NULL,
    "linearIssueId" TEXT NOT NULL,
    "type" "PptWatchEventType" NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PptAssignmentWatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PptAssignmentWatchEvent_watchId_createdAt_idx" ON "PptAssignmentWatchEvent"("watchId", "createdAt");
CREATE INDEX "PptAssignmentWatchEvent_linearIssueId_idx" ON "PptAssignmentWatchEvent"("linearIssueId");
CREATE INDEX "PptAssignmentWatchEvent_type_createdAt_idx" ON "PptAssignmentWatchEvent"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "PptAssignmentWatchEvent" ADD CONSTRAINT "PptAssignmentWatchEvent_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "PptAssignmentWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

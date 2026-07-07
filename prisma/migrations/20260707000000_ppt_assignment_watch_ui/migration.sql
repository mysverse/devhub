ALTER TYPE "PptAssignmentWatchStatus" ADD VALUE 'SNOOZED';

ALTER TABLE "PptAssignmentWatch"
    ADD COLUMN "snoozedUntil" TIMESTAMP(3),
    ADD COLUMN "snoozeReason" TEXT,
    ADD COLUMN "lastAdminActionAt" TIMESTAMP(3),
    ADD COLUMN "lastAdminActionById" TEXT,
    ADD COLUMN "lastAdminActionNote" TEXT;

CREATE INDEX "PptAssignmentWatch_status_snoozedUntil_idx" ON "PptAssignmentWatch"("status", "snoozedUntil");

CREATE TYPE "PptAssignmentWatchStatus" AS ENUM ('ACTIVE', 'WARNED', 'UNASSIGNED', 'RESOLVED');

CREATE TABLE "PptAssignmentWatch" (
    "id" TEXT NOT NULL,
    "linearIssueId" TEXT NOT NULL,
    "linearIssueIdentifier" TEXT,
    "linearIssueTitle" TEXT,
    "linearIssueUrl" TEXT,
    "assigneeLinearId" TEXT NOT NULL,
    "assigneeEmail" TEXT,
    "assigneeName" TEXT,
    "userId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL,
    "warnedAt" TIMESTAMP(3),
    "unassignedAt" TIMESTAMP(3),
    "status" "PptAssignmentWatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "lastLinearCommentAt" TIMESTAMP(3),
    "lastLinearCommentType" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PptAssignmentWatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PptAssignmentWatch_linearIssueId_assigneeLinearId_key" ON "PptAssignmentWatch"("linearIssueId", "assigneeLinearId");
CREATE INDEX "PptAssignmentWatch_linearIssueId_idx" ON "PptAssignmentWatch"("linearIssueId");
CREATE INDEX "PptAssignmentWatch_userId_status_idx" ON "PptAssignmentWatch"("userId", "status");
CREATE INDEX "PptAssignmentWatch_status_lastActivityAt_idx" ON "PptAssignmentWatch"("status", "lastActivityAt");

ALTER TABLE "PptAssignmentWatch" ADD CONSTRAINT "PptAssignmentWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

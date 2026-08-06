-- DevHub was entirely pull-based: every earning path started with a developer
-- going to a board and choosing one, and nothing was ever addressed to a
-- person. This records the push side — an admin pointing one developer at one
-- task, with the reason — and whether it worked.
--
-- The unique constraint on (linearIssueId, userId) is the anti-nag rule:
-- one suggestion per task per person, ever.

-- CreateEnum
CREATE TYPE "TaskSuggestionOutcome" AS ENUM ('PENDING', 'CLAIMED', 'TAKEN', 'EXPIRED');

-- CreateTable
CREATE TABLE "TaskSuggestion" (
    "id" TEXT NOT NULL,
    "linearIssueId" TEXT NOT NULL,
    "linearIssueIdentifier" TEXT,
    "linearIssueTitle" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "suggestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "outcome" "TaskSuggestionOutcome" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskSuggestion_linearIssueId_userId_key" ON "TaskSuggestion"("linearIssueId", "userId");

-- CreateIndex
CREATE INDEX "TaskSuggestion_userId_outcome_idx" ON "TaskSuggestion"("userId", "outcome");

-- CreateIndex
CREATE INDEX "TaskSuggestion_outcome_createdAt_idx" ON "TaskSuggestion"("outcome", "createdAt");

-- AddForeignKey
ALTER TABLE "TaskSuggestion" ADD CONSTRAINT "TaskSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSuggestion" ADD CONSTRAINT "TaskSuggestion_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The anti-nag rule was enforced as a unique index on (linearIssueId, userId),
-- which made it permanent: once a suggestion went TAKEN (somebody else claimed
-- the task) or EXPIRED, that task could never be suggested to that person
-- again, even after it returned to the board.
--
-- The rule that was actually wanted is "one OPEN suggestion at a time", which
-- is a predicate on outcome and is enforced in suggestTaskToDeveloper. Demote
-- the constraint to a plain index so the lookup stays fast.

-- DropIndex
DROP INDEX "TaskSuggestion_linearIssueId_userId_key";

-- CreateIndex
CREATE INDEX "TaskSuggestion_linearIssueId_userId_idx" ON "TaskSuggestion"("linearIssueId", "userId");

-- PPT request: allow re-requesting after a rejection via a nullable active-issue
-- discriminator. activeLinearIssueId = linearIssueId while the request is active
-- (PENDING/APPROVED), NULL once REJECTED. Postgres allows many NULLs in a unique
-- index, so an issue can accumulate many rejected requests but have at most one
-- active request. Mirrors the WelcomePackOrder.activeUserId pattern.

-- AlterTable: active-issue discriminator
ALTER TABLE "PptRequest" ADD COLUMN "activeLinearIssueId" TEXT;

-- Backfill before the unique index lands. Safe: the old linearIssueId unique
-- guaranteed at most one row per issue. Existing REJECTED rows keep a NULL
-- discriminator and therefore become re-request-eligible (intended).
UPDATE "PptRequest" SET "activeLinearIssueId" = "linearIssueId"
WHERE "status" IN ('PENDING', 'APPROVED') AND "linearIssueId" IS NOT NULL;

-- DropIndex: old all-status unique on linearIssueId
DROP INDEX "PptRequest_linearIssueId_key";

-- CreateIndex: active-only unique discriminator + plain lookup index for the
-- status-scoped duplicate check
CREATE UNIQUE INDEX "PptRequest_activeLinearIssueId_key" ON "PptRequest"("activeLinearIssueId");
CREATE INDEX "PptRequest_linearIssueId_idx" ON "PptRequest"("linearIssueId");

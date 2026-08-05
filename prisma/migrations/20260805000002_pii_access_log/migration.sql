-- Audit trail for READS of the most sensitive PII. Every other audit table in
-- this schema records mutations; nothing recorded that an admin opened
-- someone's government ID, selfie or bank details.
--
-- actorId/subjectId are plain columns with no foreign keys on purpose:
-- deleting a user must not cascade away the record of what they read.

-- CreateTable
CREATE TABLE "PiiAccessLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "subjectId" TEXT,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "context" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PiiAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PiiAccessLog_actorId_createdAt_idx" ON "PiiAccessLog"("actorId", "createdAt");
CREATE INDEX "PiiAccessLog_subjectId_createdAt_idx" ON "PiiAccessLog"("subjectId", "createdAt");
CREATE INDEX "PiiAccessLog_resource_createdAt_idx" ON "PiiAccessLog"("resource", "createdAt");

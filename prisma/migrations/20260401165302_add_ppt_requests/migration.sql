-- CreateEnum
CREATE TYPE "PptRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PptRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "linearIssueId" TEXT,
    "linearIssueIdentifier" TEXT,
    "linearIssueTitle" TEXT NOT NULL,
    "linearIssueUrl" TEXT,
    "linearTeamId" TEXT NOT NULL,
    "requestedEstimate" INTEGER NOT NULL,
    "projectedDueDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "note" TEXT,
    "status" "PptRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "PptRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PptRequest_linearIssueId_key" ON "PptRequest"("linearIssueId");

-- CreateIndex
CREATE INDEX "PptRequest_requesterId_idx" ON "PptRequest"("requesterId");

-- CreateIndex
CREATE INDEX "PptRequest_status_idx" ON "PptRequest"("status");

-- AddForeignKey
ALTER TABLE "PptRequest" ADD CONSTRAINT "PptRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PptRequest" ADD CONSTRAINT "PptRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

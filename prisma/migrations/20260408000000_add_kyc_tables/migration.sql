-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "autoPayoutEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "KycVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "legalName" TEXT NOT NULL,
    "documentType" TEXT,
    "idDocumentBlobUrl" TEXT,
    "selfieBlobUrl" TEXT,
    "rejectionReason" TEXT,
    "reviewerId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "documentsDeletedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycAuditLog" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KycVerification_userId_idx" ON "KycVerification"("userId");

-- CreateIndex
CREATE INDEX "KycVerification_status_idx" ON "KycVerification"("status");

-- CreateIndex
CREATE INDEX "KycAuditLog_verificationId_idx" ON "KycAuditLog"("verificationId");

-- AddForeignKey
ALTER TABLE "KycVerification" ADD CONSTRAINT "KycVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycAuditLog" ADD CONSTRAINT "KycAuditLog_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "KycVerification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

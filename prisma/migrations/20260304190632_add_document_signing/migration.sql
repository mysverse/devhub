-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('COI', 'NDA');

-- CreateTable
CREATE TABLE "SignedDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "templateContent" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "SignedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoiEntry" (
    "id" TEXT NOT NULL,
    "signedDocumentId" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "natureOfInvolvement" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoiEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignedDocument_userId_documentType_key" ON "SignedDocument"("userId", "documentType");

-- AddForeignKey
ALTER TABLE "SignedDocument" ADD CONSTRAINT "SignedDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoiEntry" ADD CONSTRAINT "CoiEntry_signedDocumentId_fkey" FOREIGN KEY ("signedDocumentId") REFERENCES "SignedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

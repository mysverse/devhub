-- Attachments on PPT progress and proof comments.
--
-- Rows exist only for bytes that reached Linear: both upload paths (multipart
-- proxy and Vercel Blob relay) complete synchronously, so there is no pending
-- state to reconcile. UPLOADED means "on Linear, not yet referenced by a
-- comment"; POSTED is terminal.
--
-- The table exists so the client never hands a URL to a comment-posting path:
-- it sends ids, the server resolves URLs from here, and a replayed or
-- tampered id resolves to nothing.

-- CreateEnum
CREATE TYPE "PptCommentAttachmentKind" AS ENUM ('PROGRESS', 'PROOF');

-- CreateEnum
CREATE TYPE "PptCommentAttachmentStatus" AS ENUM ('UPLOADED', 'POSTED');

-- CreateTable
CREATE TABLE "PptCommentAttachment" (
    "id" TEXT NOT NULL,
    "linearIssueId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "kind" "PptCommentAttachmentKind" NOT NULL,
    "status" "PptCommentAttachmentStatus" NOT NULL DEFAULT 'UPLOADED',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "linearAssetUrl" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "linearCommentId" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PptCommentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PptCommentAttachment_linearIssueId_uploadedById_status_idx" ON "PptCommentAttachment"("linearIssueId", "uploadedById", "status");

-- CreateIndex
CREATE INDEX "PptCommentAttachment_uploadedById_createdAt_idx" ON "PptCommentAttachment"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "PptCommentAttachment_status_createdAt_idx" ON "PptCommentAttachment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PptCommentAttachment" ADD CONSTRAINT "PptCommentAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

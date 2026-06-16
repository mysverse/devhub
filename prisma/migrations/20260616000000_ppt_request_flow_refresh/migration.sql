CREATE TYPE "PptRequestAssigneeIntent" AS ENUM ('SELF', 'TEAM_MEMBER', 'OPEN');

ALTER TABLE "PptRequest"
ADD COLUMN "linearProjectId" TEXT,
ADD COLUMN "linearProjectName" TEXT,
ADD COLUMN "assigneeIntent" "PptRequestAssigneeIntent" NOT NULL DEFAULT 'SELF',
ADD COLUMN "intendedAssigneeLinearId" TEXT,
ADD COLUMN "intendedAssigneeName" TEXT,
ADD COLUMN "intendedAssigneeEmail" TEXT;

CREATE TABLE "PptRequestAttachment" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "linearAssetUrl" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PptRequestAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PptRequest_assigneeIntent_idx" ON "PptRequest"("assigneeIntent");
CREATE INDEX "PptRequestAttachment_requestId_sortOrder_idx" ON "PptRequestAttachment"("requestId", "sortOrder");
CREATE INDEX "PptRequestAttachment_uploadedById_idx" ON "PptRequestAttachment"("uploadedById");
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");
CREATE INDEX "NotificationPreference_domain_type_idx" ON "NotificationPreference"("domain", "type");
CREATE UNIQUE INDEX "NotificationPreference_userId_domain_type_channel_key" ON "NotificationPreference"("userId", "domain", "type", "channel");

ALTER TABLE "PptRequestAttachment"
ADD CONSTRAINT "PptRequestAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PptRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PptRequestAttachment"
ADD CONSTRAINT "PptRequestAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationPreference"
ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

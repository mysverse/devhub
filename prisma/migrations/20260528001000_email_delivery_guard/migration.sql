CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "EmailDelivery" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "fingerprint" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "providerId" TEXT,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailDelivery_dedupeKey_key"
ON "EmailDelivery"("dedupeKey");

CREATE INDEX "EmailDelivery_recipient_createdAt_idx"
ON "EmailDelivery"("recipient", "createdAt");

CREATE INDEX "EmailDelivery_idempotencyKey_idx"
ON "EmailDelivery"("idempotencyKey");

CREATE INDEX "EmailDelivery_fingerprint_createdAt_idx"
ON "EmailDelivery"("fingerprint", "createdAt");

CREATE INDEX "EmailDelivery_category_createdAt_idx"
ON "EmailDelivery"("category", "createdAt");

CREATE INDEX "EmailDelivery_status_createdAt_idx"
ON "EmailDelivery"("status", "createdAt");

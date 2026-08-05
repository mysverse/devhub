-- Welcome-pack shipping PII becomes purgeable once an order is settled. The
-- columns are made nullable rather than filled with a "[purged]" tombstone so
-- Prisma's generated types force every reader to handle the absence — a
-- tombstone string would silently flow into the EasyParcel workbook and read
-- as a real address.

-- AlterTable: shipping fields the retention sweep clears
ALTER TABLE "WelcomePackOrder" ALTER COLUMN "recipientName" DROP NOT NULL;
ALTER TABLE "WelcomePackOrder" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "WelcomePackOrder" ALTER COLUMN "addressLine1" DROP NOT NULL;
ALTER TABLE "WelcomePackOrder" ALTER COLUMN "city" DROP NOT NULL;
ALTER TABLE "WelcomePackOrder" ALTER COLUMN "postalCode" DROP NOT NULL;

-- AlterTable: purge marker, mirroring KycVerification.documentsDeletedAt.
-- Makes the sweep idempotent — a re-run skips rows it has already cleared.
ALTER TABLE "WelcomePackOrder" ADD COLUMN "addressPurgedAt" TIMESTAMP(3);

-- CreateIndex: drives the sweep's scan for settled orders past their window
CREATE INDEX "WelcomePackOrder_status_deliveredAt_idx" ON "WelcomePackOrder"("status", "deliveredAt");

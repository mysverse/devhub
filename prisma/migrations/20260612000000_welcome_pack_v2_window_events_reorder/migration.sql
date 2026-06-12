-- Welcome Pack v2: ordering window, order events, re-ordering after
-- cancellation/rejection.
--
-- Re-ordering: the userId unique constraint is replaced by a nullable unique
-- "activeUserId" discriminator — set to userId while the order is in a
-- non-terminal status, NULL once CANCELLED/REJECTED. Existing cancelled and
-- rejected orders therefore become re-order-eligible on deploy (intended).

-- AlterTable: ordering window controls
ALTER TABLE "WelcomePack" ADD COLUMN "orderingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WelcomePack" ADD COLUMN "ordersOpenAt" TIMESTAMP(3);
ALTER TABLE "WelcomePack" ADD COLUMN "ordersCloseAt" TIMESTAMP(3);

-- AlterTable: active-order discriminator
ALTER TABLE "WelcomePackOrder" ADD COLUMN "activeUserId" TEXT;

-- Backfill before the unique index lands. Safe: the old userId unique
-- guarantees at most one row per user.
UPDATE "WelcomePackOrder" SET "activeUserId" = "userId"
WHERE "status" NOT IN ('CANCELLED', 'REJECTED');

-- DropIndex
DROP INDEX "WelcomePackOrder_userId_key";

-- CreateIndex
CREATE UNIQUE INDEX "WelcomePackOrder_activeUserId_key" ON "WelcomePackOrder"("activeUserId");

-- CreateIndex
CREATE INDEX "WelcomePackOrder_userId_idx" ON "WelcomePackOrder"("userId");

-- CreateTable
CREATE TABLE "WelcomePackOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WelcomePackOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WelcomePackOrderEvent_orderId_createdAt_idx" ON "WelcomePackOrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "WelcomePackOrderEvent_type_createdAt_idx" ON "WelcomePackOrderEvent"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "WelcomePackOrderEvent" ADD CONSTRAINT "WelcomePackOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WelcomePackOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

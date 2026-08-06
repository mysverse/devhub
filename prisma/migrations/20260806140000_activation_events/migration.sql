-- The activation funnel could not be measured end to end. Most of it already
-- leaves a trace — PptAssignmentWatch for claims, PptPayoutState for proof,
-- PptPayoutEvent for rejected proof, Transaction for payouts,
-- TaskSuggestion.outcome for pushed work — but answering "how far did each
-- person get, and where did they stop" meant joining five tables with
-- different shapes and different notions of time.
--
-- This records first-time crossings only. It deliberately does not duplicate
-- the tables above, and deliberately records nothing about impressions: with
-- Next prefetching and cacheComponents, a "viewed the board" row would be
-- written for people who never actually looked at it.
--
-- userId has no foreign key: deleting a user must not cascade away the record
-- that they were here at all.

-- CreateTable
CREATE TABLE "ActivationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivationEvent_userId_kind_entityId_key" ON "ActivationEvent"("userId", "kind", "entityId");

-- CreateIndex
CREATE INDEX "ActivationEvent_userId_createdAt_idx" ON "ActivationEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivationEvent_kind_createdAt_idx" ON "ActivationEvent"("kind", "createdAt");

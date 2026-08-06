-- DevHub had an LLM adapter with no meter: message.usage was discarded, there
-- was no cap, and the only record of a call was a console.warn when it failed.
-- Cost was unknowable and unbounded, which is the wrong shape to put a
-- user-driven prompt box in front of.
--
-- This table is both the usage record and the rate-limit ledger — the same
-- pattern EmailDelivery already serves for email throttling (rolling-window
-- COUNT, no extra infrastructure).
--
-- userId is a plain column with no foreign key on purpose: deleting a user
-- must not erase the record of what was spent on their behalf.

-- CreateTable
CREATE TABLE "LlmCall" (
    "id" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "userId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmCall_createdAt_idx" ON "LlmCall"("createdAt");

-- CreateIndex
CREATE INDEX "LlmCall_userId_createdAt_idx" ON "LlmCall"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmCall_surface_createdAt_idx" ON "LlmCall"("surface", "createdAt");

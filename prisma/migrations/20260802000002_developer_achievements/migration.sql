-- Persisted, peer-visible achievements. Unique (userId, key) makes awarding
-- idempotent across webhook + cron paths; seenAt gates one-time celebrations.

-- CreateTable
CREATE TABLE "DeveloperAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),
    "meta" JSONB,

    CONSTRAINT "DeveloperAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperAchievement_userId_key_key" ON "DeveloperAchievement"("userId", "key");
CREATE INDEX "DeveloperAchievement_userId_earnedAt_idx" ON "DeveloperAchievement"("userId", "earnedAt");

-- AddForeignKey
ALTER TABLE "DeveloperAchievement" ADD CONSTRAINT "DeveloperAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

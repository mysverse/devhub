ALTER TABLE "NotificationDelivery"
ADD COLUMN "seenAt" TIMESTAMP(3);

CREATE INDEX "NotificationDelivery_channel_seenAt_idx" ON "NotificationDelivery"("channel", "seenAt");

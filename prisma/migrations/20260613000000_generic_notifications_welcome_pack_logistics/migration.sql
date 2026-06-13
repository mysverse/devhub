-- Generic notification infrastructure.
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorId" TEXT,
  "domain" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "href" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "payload" JSONB,
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "readAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "skippedReason" TEXT,
  "failedReason" TEXT,
  "providerMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
CREATE INDEX "Notification_domain_type_idx" ON "Notification"("domain", "type");
CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");
CREATE INDEX "NotificationDelivery_channel_status_idx" ON "NotificationDelivery"("channel", "status");
CREATE INDEX "NotificationDelivery_channel_readAt_idx" ON "NotificationDelivery"("channel", "readAt");
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationDelivery"
ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing in-app notifications into the generic model.
INSERT INTO "Notification" (
  "id",
  "userId",
  "domain",
  "type",
  "title",
  "message",
  "href",
  "entityType",
  "entityId",
  "payload",
  "dedupeKey",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy:ppt:' || pn."id",
  pn."userId",
  'ppt',
  pn."type"::TEXT,
  pn."title",
  pn."message",
  '/dashboard/ppts',
  'ppt_payout_state',
  pn."stateId",
  jsonb_build_object(
    'legacyId', pn."id",
    'stateId', pn."stateId",
    'identifier', ps."linearIssueIdentifier",
    'issueTitle', ps."linearIssueTitle",
    'issueUrl', ps."linearIssueUrl",
    'status', ps."status"::TEXT,
    'reason', ps."reason"::TEXT
  ),
  'legacy:ppt:' || pn."id",
  pn."createdAt",
  pn."createdAt"
FROM "PptNotification" pn
JOIN "PptPayoutState" ps ON ps."id" = pn."stateId";

INSERT INTO "NotificationDelivery" (
  "id",
  "notificationId",
  "channel",
  "status",
  "readAt",
  "sentAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy:ppt:' || pn."id" || ':in_app',
  'legacy:ppt:' || pn."id",
  'in_app',
  'SENT',
  pn."readAt",
  pn."createdAt",
  pn."createdAt",
  pn."createdAt"
FROM "PptNotification" pn;

INSERT INTO "Notification" (
  "id",
  "userId",
  "domain",
  "type",
  "title",
  "message",
  "href",
  "entityType",
  "entityId",
  "payload",
  "dedupeKey",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy:bonus:' || bn."id",
  bn."userId",
  'bonus',
  bn."type"::TEXT,
  COALESCE(bc."linearIssueTitle", bc."linearIssueIdentifier", 'Bonus task'),
  'Potential bonus available',
  '/dashboard/bonuses',
  'bonus_candidate',
  bn."candidateId",
  jsonb_build_object(
    'legacyId', bn."id",
    'candidateId', bn."candidateId",
    'identifier', bc."linearIssueIdentifier",
    'issueTitle', bc."linearIssueTitle",
    'amount', bc."maxAmount",
    'currency', bc."currency"
  ),
  'legacy:bonus:' || bn."id",
  bn."createdAt",
  bn."createdAt"
FROM "BonusNotification" bn
JOIN "BonusCandidate" bc ON bc."id" = bn."candidateId";

INSERT INTO "NotificationDelivery" (
  "id",
  "notificationId",
  "channel",
  "status",
  "readAt",
  "sentAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy:bonus:' || bn."id" || ':in_app',
  'legacy:bonus:' || bn."id",
  'in_app',
  'SENT',
  bn."readAt",
  bn."createdAt",
  bn."createdAt",
  bn."createdAt"
FROM "BonusNotification" bn;

INSERT INTO "Notification" (
  "id",
  "userId",
  "domain",
  "type",
  "title",
  "message",
  "href",
  "entityType",
  "entityId",
  "payload",
  "dedupeKey",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy:incentive:' || inot."id",
  inot."userId",
  'incentive',
  inot."type"::TEXT,
  ia."type"::TEXT,
  CASE
    WHEN inot."type"::TEXT = 'INCENTIVE_DISPUTED' THEN 'Incentive award updated'
    ELSE 'New incentive earned'
  END,
  '/dashboard',
  'incentive_award',
  inot."awardId",
  jsonb_build_object(
    'legacyId', inot."id",
    'awardId', inot."awardId",
    'awardType', ia."type"::TEXT,
    'period', ia."period",
    'amount', ia."amount",
    'currency', ia."currency",
    'status', ia."status"::TEXT,
    'releaseAt', ia."releaseAt"
  ),
  'legacy:incentive:' || inot."id",
  inot."createdAt",
  inot."createdAt"
FROM "IncentiveNotification" inot
JOIN "IncentiveAward" ia ON ia."id" = inot."awardId";

INSERT INTO "NotificationDelivery" (
  "id",
  "notificationId",
  "channel",
  "status",
  "readAt",
  "sentAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy:incentive:' || inot."id" || ':in_app',
  'legacy:incentive:' || inot."id",
  'in_app',
  'SENT',
  inot."readAt",
  inot."createdAt",
  inot."createdAt",
  inot."createdAt"
FROM "IncentiveNotification" inot;

-- Welcome pack logistics defaults and order-level fulfilment fields.
ALTER TABLE "WelcomePack"
ADD COLUMN "defaultDomesticFulfillmentDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN "defaultInternationalFulfillmentDays" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN "defaultDomesticDeliveryDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "defaultInternationalDeliveryDays" INTEGER NOT NULL DEFAULT 14;

ALTER TABLE "WelcomePackOrder"
ADD COLUMN "carrierName" TEXT,
ADD COLUMN "estimatedFulfillmentAt" TIMESTAMP(3),
ADD COLUMN "estimatedDeliveryAt" TIMESTAMP(3),
ADD COLUMN "logisticsNote" TEXT,
ADD COLUMN "delayedAt" TIMESTAMP(3),
ADD COLUMN "delayReason" TEXT;

-- Remove legacy domain-specific in-app notification tables.
DROP TABLE "PptNotification";
DROP TABLE "BonusNotification";
DROP TABLE "IncentiveNotification";
DROP TYPE "PptNotificationType";
DROP TYPE "BonusNotificationType";
DROP TYPE "IncentiveNotificationType";

ALTER TABLE "AccessIntegrationConfig"
ADD COLUMN IF NOT EXISTS "robloxDevelopmentLegacyFallbackRoleId" INTEGER,
ADD COLUMN IF NOT EXISTS "robloxPublisherLegacyFallbackRoleId" INTEGER;

-- Persist every external role DevHub has managed so stale roles can still be
-- revoked after an admin changes or clears a mapping.
CREATE TABLE "AccessManagedRole" (
    "id" TEXT NOT NULL,
    "platform" "AccessSyncPlatform" NOT NULL,
    "scope" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessManagedRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessManagedRole_platform_scope_roleId_key" ON "AccessManagedRole"("platform", "scope", "roleId");
CREATE INDEX "AccessManagedRole_platform_scope_idx" ON "AccessManagedRole"("platform", "scope");

WITH roles AS (
    SELECT 'ROBLOX_OPEN_CLOUD'::"AccessSyncPlatform" AS "platform", 'development' AS "scope", "robloxRoleId" AS "roleId"
    FROM "RankRoleMapping"
    WHERE "robloxRoleId" IS NOT NULL
    UNION ALL
    SELECT 'ROBLOX_LEGACY'::"AccessSyncPlatform", 'development', "robloxLegacyRoleId"::TEXT
    FROM "RankRoleMapping"
    WHERE "robloxLegacyRoleId" IS NOT NULL
    UNION ALL
    SELECT 'DISCORD'::"AccessSyncPlatform", 'guild', "discordRoleId"
    FROM "RankRoleMapping"
    WHERE "discordRoleId" IS NOT NULL
    UNION ALL
    SELECT 'DISCORD'::"AccessSyncPlatform", 'guild', "discordRoleId"
    FROM "SpecialtyRoleMapping"
    WHERE "discordRoleId" IS NOT NULL
    UNION ALL
    SELECT 'ROBLOX_OPEN_CLOUD'::"AccessSyncPlatform", 'publisher', "robloxContributorRoleId"
    FROM "DevProject"
    WHERE "robloxContributorRoleId" IS NOT NULL
    UNION ALL
    SELECT 'ROBLOX_OPEN_CLOUD'::"AccessSyncPlatform", 'publisher', "robloxDeveloperRoleId"
    FROM "DevProject"
    WHERE "robloxDeveloperRoleId" IS NOT NULL
    UNION ALL
    SELECT 'ROBLOX_OPEN_CLOUD'::"AccessSyncPlatform", 'publisher', "robloxPublisherRoleId"
    FROM "DevProject"
    WHERE "robloxPublisherRoleId" IS NOT NULL
    UNION ALL
    SELECT 'ROBLOX_LEGACY'::"AccessSyncPlatform", 'publisher', "robloxContributorLegacyRoleId"::TEXT
    FROM "DevProject"
    WHERE "robloxContributorLegacyRoleId" IS NOT NULL
    UNION ALL
    SELECT 'ROBLOX_LEGACY'::"AccessSyncPlatform", 'publisher', "robloxDeveloperLegacyRoleId"::TEXT
    FROM "DevProject"
    WHERE "robloxDeveloperLegacyRoleId" IS NOT NULL
    UNION ALL
    SELECT 'ROBLOX_LEGACY'::"AccessSyncPlatform", 'publisher', "robloxPublisherLegacyRoleId"::TEXT
    FROM "DevProject"
    WHERE "robloxPublisherLegacyRoleId" IS NOT NULL
    UNION ALL
    SELECT 'DISCORD'::"AccessSyncPlatform", 'guild', "discordContributorRoleId"
    FROM "DevProject"
    WHERE "discordContributorRoleId" IS NOT NULL
    UNION ALL
    SELECT 'DISCORD'::"AccessSyncPlatform", 'guild', "discordDeveloperRoleId"
    FROM "DevProject"
    WHERE "discordDeveloperRoleId" IS NOT NULL
    UNION ALL
    SELECT 'DISCORD'::"AccessSyncPlatform", 'guild', "discordPublisherRoleId"
    FROM "DevProject"
    WHERE "discordPublisherRoleId" IS NOT NULL
),
deduped_roles AS (
    SELECT DISTINCT "platform", "scope", trim("roleId") AS "roleId"
    FROM roles
    WHERE "roleId" IS NOT NULL AND trim("roleId") <> ''
)
INSERT INTO "AccessManagedRole" ("id", "platform", "scope", "roleId", "createdAt", "updatedAt")
SELECT
    'managed_' || md5("platform"::TEXT || ':' || "scope" || ':' || "roleId"),
    "platform",
    "scope",
    "roleId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM deduped_roles
ON CONFLICT DO NOTHING;

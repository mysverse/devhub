-- Reuse AccessManagedRole as the historical managed-target registry for Linear
-- project/team IDs so mapping edits can still revoke old Linear access.
WITH targets AS (
    SELECT 'LINEAR'::"AccessSyncPlatform" AS "platform", 'linearProject' AS "scope", "linearProjectId" AS "roleId"
    FROM "DevProject"
    WHERE "linearProjectId" IS NOT NULL
    UNION ALL
    SELECT 'LINEAR'::"AccessSyncPlatform", 'linearTeam', "linearTeamId"
    FROM "DevProject"
    WHERE "linearTeamId" IS NOT NULL
),
deduped_targets AS (
    SELECT DISTINCT "platform", "scope", trim("roleId") AS "roleId"
    FROM targets
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
FROM deduped_targets
ON CONFLICT DO NOTHING;

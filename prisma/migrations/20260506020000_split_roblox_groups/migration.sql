-- Split Roblox access sync into the rank/development group and the
-- experience publishing group without mutating the original access migration.
ALTER TABLE "AccessIntegrationConfig"
ADD COLUMN IF NOT EXISTS "robloxDevelopmentGroupId" TEXT,
ADD COLUMN IF NOT EXISTS "robloxPublisherGroupId" TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
            AND table_name = 'AccessIntegrationConfig'
            AND column_name = 'robloxGroupId'
    ) THEN
        EXECUTE 'UPDATE "AccessIntegrationConfig"
            SET "robloxDevelopmentGroupId" = "robloxGroupId"
            WHERE "robloxDevelopmentGroupId" IS NULL
                AND "robloxGroupId" IS NOT NULL';
    END IF;
END $$;

ALTER TABLE "AccessIntegrationConfig"
DROP COLUMN IF EXISTS "robloxGroupId";

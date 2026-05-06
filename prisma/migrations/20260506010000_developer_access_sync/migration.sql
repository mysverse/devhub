-- CreateEnum
CREATE TYPE "DeveloperRank" AS ENUM ('PROBATIONARY_DEVELOPER', 'JUNIOR_DEVELOPER', 'DEVELOPER', 'SENIOR_DEVELOPER', 'DEVELOPER_COUNCIL', 'HEAD_DEVELOPER');

-- CreateEnum
CREATE TYPE "DeveloperSpecialty" AS ENUM ('SCRIPTING', 'BUILDING', 'MESHING', 'VEHICLES');

-- CreateEnum
CREATE TYPE "ProjectAccessLevel" AS ENUM ('CONTRIBUTOR', 'DEVELOPER', 'PUBLISHER');

-- CreateEnum
CREATE TYPE "AccessSyncPlatform" AS ENUM ('ROBLOX_OPEN_CLOUD', 'ROBLOX_LEGACY', 'DISCORD', 'LINEAR');

-- CreateEnum
CREATE TYPE "AccessSyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "UserProfile"
ADD COLUMN "developerRank" "DeveloperRank" NOT NULL DEFAULT 'PROBATIONARY_DEVELOPER',
ADD COLUMN "specialties" "DeveloperSpecialty"[] NOT NULL DEFAULT ARRAY[]::"DeveloperSpecialty"[],
ADD COLUMN "probationStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "initialReviewAt" TIMESTAMP(3),
ADD COLUMN "finalReviewAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccessIntegrationConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "robloxGroupId" TEXT,
    "robloxOpenCloudEnabled" BOOLEAN NOT NULL DEFAULT true,
    "robloxLegacyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "discordGuildId" TEXT,
    "discordEnabled" BOOLEAN NOT NULL DEFAULT true,
    "linearEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessIntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankRoleMapping" (
    "id" TEXT NOT NULL,
    "rank" "DeveloperRank" NOT NULL,
    "robloxRoleId" TEXT,
    "robloxLegacyRoleId" INTEGER,
    "discordRoleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RankRoleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialtyRoleMapping" (
    "id" TEXT NOT NULL,
    "specialty" "DeveloperSpecialty" NOT NULL,
    "discordRoleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialtyRoleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevProject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "robloxContributorRoleId" TEXT,
    "robloxDeveloperRoleId" TEXT,
    "robloxPublisherRoleId" TEXT,
    "robloxContributorLegacyRoleId" INTEGER,
    "robloxDeveloperLegacyRoleId" INTEGER,
    "robloxPublisherLegacyRoleId" INTEGER,
    "discordContributorRoleId" TEXT,
    "discordDeveloperRoleId" TEXT,
    "discordPublisherRoleId" TEXT,
    "linearTeamId" TEXT,
    "linearProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "accessLevel" "ProjectAccessLevel" NOT NULL,
    "allowJuniorRobloxAccess" BOOLEAN NOT NULL DEFAULT false,
    "assignedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessSyncLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "platform" "AccessSyncPlatform" NOT NULL,
    "status" "AccessSyncStatus" NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RankRoleMapping_rank_key" ON "RankRoleMapping"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialtyRoleMapping_specialty_key" ON "SpecialtyRoleMapping"("specialty");

-- CreateIndex
CREATE UNIQUE INDEX "DevProject_name_key" ON "DevProject"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DevProject_slug_key" ON "DevProject"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMembership_userId_projectId_key" ON "ProjectMembership"("userId", "projectId");

-- CreateIndex
CREATE INDEX "ProjectMembership_projectId_idx" ON "ProjectMembership"("projectId");

-- CreateIndex
CREATE INDEX "AccessSyncLog_userId_idx" ON "AccessSyncLog"("userId");

-- CreateIndex
CREATE INDEX "AccessSyncLog_platform_status_idx" ON "AccessSyncLog"("platform", "status");

-- AddForeignKey
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DevProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessSyncLog" ADD CONSTRAINT "AccessSyncLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessSyncLog" ADD CONSTRAINT "AccessSyncLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

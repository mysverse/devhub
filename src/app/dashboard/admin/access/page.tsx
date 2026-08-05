import type { Metadata } from "next";
import { Suspense } from "react";
import LinkButton from "@/components/LinkButton";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { requireAdminPage } from "@/lib/authz";
import { DEVELOPER_RANKS, DEVELOPER_SPECIALTIES } from "@/lib/developer-access";
import { resolveDisplayName } from "@/lib/display-name";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import AccessManagementClient from "./AccessManagementClient";

export const metadata: Metadata = buildSocialMetadata(
  "/dashboard/admin/access",
);

export default function AccessManagementPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Access Management"
        subtitle="Configure developer ranks, project access, and platform role sync."
        action={
          <LinkButton href="/dashboard/admin" variant="subtle">
            Back to Admin
          </LinkButton>
        }
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <AccessManagementContent />
      </Suspense>
    </PageContainer>
  );
}

async function AccessManagementContent() {
  await requireAdminPage();

  const [config, rankMappings, specialtyMappings, projects, users] =
    await Promise.all([
      prisma.accessIntegrationConfig.findUnique({ where: { id: "default" } }),
      prisma.rankRoleMapping.findMany(),
      prisma.specialtyRoleMapping.findMany(),
      prisma.devProject.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
      prisma.userProfile.findMany({
        include: {
          user: { select: { name: true, email: true, image: true } },
          projectMemberships: {
            include: { project: true },
            orderBy: { createdAt: "asc" },
          },
          accessSyncLogs: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
        orderBy: [{ preferredName: "asc" }, { id: "asc" }],
      }),
    ]);

  return (
    <AccessManagementClient
      config={
        config
          ? {
              robloxDevelopmentGroupId: config.robloxDevelopmentGroupId,
              robloxPublisherGroupId: config.robloxPublisherGroupId,
              robloxDevelopmentLegacyFallbackRoleId:
                config.robloxDevelopmentLegacyFallbackRoleId?.toString() ?? "",
              robloxPublisherLegacyFallbackRoleId:
                config.robloxPublisherLegacyFallbackRoleId?.toString() ?? "",
              robloxOpenCloudEnabled: config.robloxOpenCloudEnabled,
              robloxLegacyEnabled: config.robloxLegacyEnabled,
              discordGuildId: config.discordGuildId,
              discordEnabled: config.discordEnabled,
              linearEnabled: config.linearEnabled,
            }
          : null
      }
      rankMappings={DEVELOPER_RANKS.map((rank) => {
        const mapping = rankMappings.find((item) => item.rank === rank);
        return {
          rank,
          robloxRoleId: mapping?.robloxRoleId ?? "",
          robloxLegacyRoleId: mapping?.robloxLegacyRoleId?.toString() ?? "",
          discordRoleId: mapping?.discordRoleId ?? "",
        };
      })}
      specialtyMappings={DEVELOPER_SPECIALTIES.map((specialty) => {
        const mapping = specialtyMappings.find(
          (item) => item.specialty === specialty,
        );
        return {
          specialty,
          discordRoleId: mapping?.discordRoleId ?? "",
        };
      })}
      projects={projects.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        isActive: project.isActive,
        robloxContributorRoleId: project.robloxContributorRoleId,
        robloxDeveloperRoleId: project.robloxDeveloperRoleId,
        robloxPublisherRoleId: project.robloxPublisherRoleId,
        robloxContributorLegacyRoleId:
          project.robloxContributorLegacyRoleId?.toString() ?? "",
        robloxDeveloperLegacyRoleId:
          project.robloxDeveloperLegacyRoleId?.toString() ?? "",
        robloxPublisherLegacyRoleId:
          project.robloxPublisherLegacyRoleId?.toString() ?? "",
        discordContributorRoleId: project.discordContributorRoleId,
        discordDeveloperRoleId: project.discordDeveloperRoleId,
        discordPublisherRoleId: project.discordPublisherRoleId,
        linearTeamId: project.linearTeamId,
        linearProjectId: project.linearProjectId,
      }))}
      users={users.map((profile) => ({
        id: profile.id,
        displayName: resolveDisplayName({ profile }),
        email: profile.user.email,
        image: profile.user.image,
        developerRank: profile.developerRank,
        specialties: profile.specialties,
        robloxId: profile.robloxId,
        discordId: profile.discordId,
        linearId: profile.linearId,
        memberships: profile.projectMemberships.map((membership) => ({
          projectId: membership.projectId,
          accessLevel: membership.accessLevel,
          allowJuniorRobloxAccess: membership.allowJuniorRobloxAccess,
        })),
        lastSyncLogs: profile.accessSyncLogs.map((log) => ({
          id: log.id,
          platform: log.platform,
          status: log.status,
          action: log.action,
          error: log.error,
          dryRun: log.dryRun,
          createdAt: log.createdAt.toISOString(),
        })),
      }))}
    />
  );
}

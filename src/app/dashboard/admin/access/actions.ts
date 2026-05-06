"use server";

import type { AccessSyncPlatform, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGED_ROLE_SCOPES, syncUserAccess } from "@/lib/access-sync";
import { requireAdmin } from "@/lib/authz";
import {
  DEVELOPER_RANKS,
  DEVELOPER_SPECIALTIES,
  PROJECT_ACCESS_LEVELS,
} from "@/lib/developer-access";
import prisma from "@/lib/prisma";

const nullableString = z
  .string()
  .optional()
  .nullable()
  .transform((value) => value?.trim() || null);

function isPositiveIntegerRoleId(value: number) {
  return Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}

const nullableInt = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .superRefine((value, ctx) => {
    if (value === null || value === undefined) return;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return;

      if (!/^\d+$/.test(trimmed) || !isPositiveIntegerRoleId(Number(trimmed))) {
        ctx.addIssue({
          code: "custom",
          message: "Role ID must be a positive integer",
        });
      }
      return;
    }

    if (!isPositiveIntegerRoleId(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Role ID must be a positive integer",
      });
    }
  })
  .transform((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? Number(trimmed) : null;
    }
    return value;
  });

const IntegrationConfigSchema = z.object({
  robloxDevelopmentGroupId: nullableString,
  robloxPublisherGroupId: nullableString,
  robloxDevelopmentLegacyFallbackRoleId: nullableInt,
  robloxPublisherLegacyFallbackRoleId: nullableInt,
  robloxOpenCloudEnabled: z.boolean(),
  robloxLegacyEnabled: z.boolean(),
  discordGuildId: nullableString,
  discordEnabled: z.boolean(),
  linearEnabled: z.boolean(),
});

const RankMappingSchema = z.object({
  rank: z.enum(DEVELOPER_RANKS),
  robloxRoleId: nullableString,
  robloxLegacyRoleId: nullableInt,
  discordRoleId: nullableString,
});

const SpecialtyMappingSchema = z.object({
  specialty: z.enum(DEVELOPER_SPECIALTIES),
  discordRoleId: nullableString,
});

const ProjectSchema = z.object({
  id: nullableString,
  name: z.string().min(1, "Project name is required"),
  slug: nullableString,
  description: nullableString,
  isActive: z.boolean(),
  robloxContributorRoleId: nullableString,
  robloxDeveloperRoleId: nullableString,
  robloxPublisherRoleId: nullableString,
  robloxContributorLegacyRoleId: nullableInt,
  robloxDeveloperLegacyRoleId: nullableInt,
  robloxPublisherLegacyRoleId: nullableInt,
  discordContributorRoleId: nullableString,
  discordDeveloperRoleId: nullableString,
  discordPublisherRoleId: nullableString,
  linearTeamId: nullableString,
  linearProjectId: nullableString,
});

const UserAccessSchema = z.object({
  userId: z.string().min(1),
  developerRank: z.enum(DEVELOPER_RANKS),
  specialties: z.array(z.enum(DEVELOPER_SPECIALTIES)),
  projects: z.array(
    z.object({
      projectId: z.string().min(1),
      accessLevel: z.enum(PROJECT_ACCESS_LEVELS),
      allowJuniorRobloxAccess: z.boolean(),
    }),
  ),
});

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function accessPath() {
  revalidatePath("/dashboard/admin/access");
  revalidatePath("/dashboard/admin/users");
}

function serializeProject(project: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  robloxContributorRoleId: string | null;
  robloxDeveloperRoleId: string | null;
  robloxPublisherRoleId: string | null;
  robloxContributorLegacyRoleId: number | null;
  robloxDeveloperLegacyRoleId: number | null;
  robloxPublisherLegacyRoleId: number | null;
  discordContributorRoleId: string | null;
  discordDeveloperRoleId: string | null;
  discordPublisherRoleId: string | null;
  linearTeamId: string | null;
  linearProjectId: string | null;
}) {
  return {
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
  };
}

type ManagedRoleInput = {
  platform: AccessSyncPlatform;
  scope: string;
  roleId: number | string | null | undefined;
};

function managedRole(
  platform: AccessSyncPlatform,
  scope: string,
  roleId: number | string | null | undefined,
): ManagedRoleInput {
  return { platform, scope, roleId };
}

function rankManagedRoles(
  mapping:
    | {
        robloxRoleId?: string | null;
        robloxLegacyRoleId?: number | null;
        discordRoleId?: string | null;
      }
    | null
    | undefined,
) {
  if (!mapping) return [];

  return [
    managedRole(
      "ROBLOX_OPEN_CLOUD",
      MANAGED_ROLE_SCOPES.development,
      mapping.robloxRoleId,
    ),
    managedRole(
      "ROBLOX_LEGACY",
      MANAGED_ROLE_SCOPES.development,
      mapping.robloxLegacyRoleId,
    ),
    managedRole("DISCORD", MANAGED_ROLE_SCOPES.discord, mapping.discordRoleId),
  ];
}

function specialtyManagedRoles(
  mapping: { discordRoleId?: string | null } | null | undefined,
) {
  if (!mapping) return [];
  return [
    managedRole("DISCORD", MANAGED_ROLE_SCOPES.discord, mapping.discordRoleId),
  ];
}

function projectManagedRoles(
  project:
    | {
        robloxContributorRoleId?: string | null;
        robloxDeveloperRoleId?: string | null;
        robloxPublisherRoleId?: string | null;
        robloxContributorLegacyRoleId?: number | null;
        robloxDeveloperLegacyRoleId?: number | null;
        robloxPublisherLegacyRoleId?: number | null;
        discordContributorRoleId?: string | null;
        discordDeveloperRoleId?: string | null;
        discordPublisherRoleId?: string | null;
        linearTeamId?: string | null;
        linearProjectId?: string | null;
      }
    | null
    | undefined,
) {
  if (!project) return [];

  return [
    managedRole(
      "ROBLOX_OPEN_CLOUD",
      MANAGED_ROLE_SCOPES.publisher,
      project.robloxContributorRoleId,
    ),
    managedRole(
      "ROBLOX_OPEN_CLOUD",
      MANAGED_ROLE_SCOPES.publisher,
      project.robloxDeveloperRoleId,
    ),
    managedRole(
      "ROBLOX_OPEN_CLOUD",
      MANAGED_ROLE_SCOPES.publisher,
      project.robloxPublisherRoleId,
    ),
    managedRole(
      "ROBLOX_LEGACY",
      MANAGED_ROLE_SCOPES.publisher,
      project.robloxContributorLegacyRoleId,
    ),
    managedRole(
      "ROBLOX_LEGACY",
      MANAGED_ROLE_SCOPES.publisher,
      project.robloxDeveloperLegacyRoleId,
    ),
    managedRole(
      "ROBLOX_LEGACY",
      MANAGED_ROLE_SCOPES.publisher,
      project.robloxPublisherLegacyRoleId,
    ),
    managedRole(
      "DISCORD",
      MANAGED_ROLE_SCOPES.discord,
      project.discordContributorRoleId,
    ),
    managedRole(
      "DISCORD",
      MANAGED_ROLE_SCOPES.discord,
      project.discordDeveloperRoleId,
    ),
    managedRole(
      "DISCORD",
      MANAGED_ROLE_SCOPES.discord,
      project.discordPublisherRoleId,
    ),
    managedRole(
      "LINEAR",
      MANAGED_ROLE_SCOPES.linearProject,
      project.linearProjectId,
    ),
    managedRole("LINEAR", MANAGED_ROLE_SCOPES.linearTeam, project.linearTeamId),
  ];
}

async function rememberManagedRoles(
  tx: Prisma.TransactionClient,
  roles: ManagedRoleInput[],
) {
  const seen = new Set<string>();
  const data = roles.flatMap((role) => {
    const roleId =
      typeof role.roleId === "number"
        ? role.roleId.toString()
        : role.roleId?.trim();
    if (!roleId) return [];

    const key = `${role.platform}:${role.scope}:${roleId}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{ platform: role.platform, scope: role.scope, roleId }];
  });

  if (data.length) {
    await tx.accessManagedRole.createMany({
      data,
      skipDuplicates: true,
    });
  }
}

export async function saveIntegrationConfig(input: unknown) {
  await requireAdmin();
  const parsed = IntegrationConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid config" };
  }

  await prisma.accessIntegrationConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ...parsed.data },
    update: parsed.data,
  });

  accessPath();
  return { success: true };
}

export async function saveRankRoleMapping(input: unknown) {
  await requireAdmin();
  const parsed = RankMappingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid mapping" };
  }

  const { rank, ...data } = parsed.data;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.rankRoleMapping.findUnique({ where: { rank } });
    await tx.rankRoleMapping.upsert({
      where: { rank },
      create: { rank, ...data },
      update: data,
    });
    await rememberManagedRoles(tx, [
      ...rankManagedRoles(existing),
      ...rankManagedRoles(data),
    ]);
  });

  accessPath();
  return { success: true };
}

export async function saveSpecialtyRoleMapping(input: unknown) {
  await requireAdmin();
  const parsed = SpecialtyMappingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid mapping" };
  }

  const { specialty, ...data } = parsed.data;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.specialtyRoleMapping.findUnique({
      where: { specialty },
    });
    await tx.specialtyRoleMapping.upsert({
      where: { specialty },
      create: { specialty, ...data },
      update: data,
    });
    await rememberManagedRoles(tx, [
      ...specialtyManagedRoles(existing),
      ...specialtyManagedRoles(data),
    ]);
  });

  accessPath();
  return { success: true };
}

export async function saveProject(input: unknown) {
  await requireAdmin();
  const parsed = ProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid project" };
  }

  const { id, ...data } = parsed.data;
  const slug = data.slug || slugify(data.name);
  if (!slug) return { error: "Project slug is required" };

  const project = await prisma.$transaction(async (tx) => {
    const existing = id
      ? await tx.devProject.findUnique({ where: { id } })
      : null;
    const saved = id
      ? await tx.devProject.update({
          where: { id },
          data: { ...data, slug },
        })
      : await tx.devProject.create({
          data: { ...data, slug },
        });

    await rememberManagedRoles(tx, [
      ...projectManagedRoles(existing),
      ...projectManagedRoles(saved),
    ]);

    return saved;
  });

  accessPath();
  return { success: true, project: serializeProject(project) };
}

export async function saveUserAccess(input: unknown) {
  const actorId = await requireAdmin();
  const parsed = UserAccessSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid user access" };
  }

  const data = parsed.data;
  await prisma.$transaction(async (tx) => {
    await tx.userProfile.update({
      where: { id: data.userId },
      data: {
        developerRank: data.developerRank,
        specialties: data.specialties,
      },
    });

    const projectIds = data.projects.map((project) => project.projectId);
    await tx.projectMembership.deleteMany({
      where: projectIds.length
        ? { userId: data.userId, projectId: { notIn: projectIds } }
        : { userId: data.userId },
    });

    for (const project of data.projects) {
      await tx.projectMembership.upsert({
        where: {
          userId_projectId: {
            userId: data.userId,
            projectId: project.projectId,
          },
        },
        create: {
          userId: data.userId,
          projectId: project.projectId,
          accessLevel: project.accessLevel,
          allowJuniorRobloxAccess: project.allowJuniorRobloxAccess,
          assignedById: actorId,
        },
        update: {
          accessLevel: project.accessLevel,
          allowJuniorRobloxAccess: project.allowJuniorRobloxAccess,
          assignedById: actorId,
        },
      });
    }
  });

  accessPath();
  revalidatePath("/dashboard");
  try {
    const results = await syncUserAccess(data.userId, actorId);
    return { success: true, results };
  } catch (error) {
    return {
      success: true,
      syncError:
        error instanceof Error ? error.message : "Saved, but sync failed",
    };
  }
}

export async function syncAccessForUser(userId: string, dryRun = false) {
  const actorId = await requireAdmin();
  try {
    const results = await syncUserAccess(userId, actorId, { dryRun });
    accessPath();
    return { success: true, results };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to sync access",
    };
  }
}

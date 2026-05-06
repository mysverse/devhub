import type {
  AccessManagedRole,
  AccessSyncPlatform,
  AccessSyncStatus,
  DeveloperRank,
  DeveloperSpecialty,
  DevProject,
  Prisma,
  ProjectAccessLevel,
  ProjectMembership,
  RankRoleMapping,
  SpecialtyRoleMapping,
  UserProfile,
} from "@prisma/client";
import {
  DEVELOPER_RANKS,
  PROJECT_ACCESS_LEVELS,
  rankAtLeast,
} from "@/lib/developer-access";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import prisma from "@/lib/prisma";

export const MANAGED_ROLE_SCOPES = {
  development: "development",
  publisher: "publisher",
  discord: "guild",
  linearProject: "linearProject",
  linearTeam: "linearTeam",
} as const;

type UserForSync = UserProfile & {
  projectMemberships: Array<ProjectMembership & { project: DevProject }>;
};

type AccessPlan = {
  robloxDevelopmentRoleIds: Set<string>;
  robloxManagedDevelopmentRoleIds: Set<string>;
  robloxPublisherRoleIds: Set<string>;
  robloxManagedPublisherRoleIds: Set<string>;
  robloxDevelopmentLegacyRoles: LegacyRoleAssignment[];
  robloxActiveDevelopmentLegacyRoleIds: Set<number>;
  robloxManagedDevelopmentLegacyRoleIds: Set<number>;
  robloxPublisherLegacyRoles: LegacyRoleAssignment[];
  robloxActivePublisherLegacyRoleIds: Set<number>;
  robloxManagedPublisherLegacyRoleIds: Set<number>;
  discordRoleIds: Set<string>;
  discordManagedRoleIds: Set<string>;
  linearProjectMemberIds: Set<string>;
  linearManagedProjectIds: Set<string>;
  linearTeamIds: Set<string>;
  linearManagedTeamIds: Set<string>;
};

type SyncResult = {
  platform: AccessSyncPlatform;
  status: AccessSyncStatus;
  action: string;
  details?: Prisma.InputJsonValue;
  error?: string;
};

type SyncOptions = {
  dryRun?: boolean;
};

type LinkedAccessProvider = "discord" | "roblox";

type LegacyRoleAssignment = {
  roleId: number;
  priority: number;
  source: string;
};

type PageableConnection<T> = {
  nodes: T[];
  pageInfo: { hasNextPage: boolean };
  fetchNext: () => Promise<PageableConnection<T>>;
};

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

function addIfPresent(set: Set<string>, value: string | null | undefined) {
  const cleaned = clean(value);
  if (cleaned) set.add(cleaned);
}

function addNumberIfPresent(
  set: Set<number>,
  value: number | null | undefined,
) {
  if (typeof value === "number" && Number.isFinite(value)) set.add(value);
}

function addNumericStringIfPresent(set: Set<number>, value: string) {
  const parsed = Number(value);
  if (Number.isSafeInteger(parsed) && parsed > 0) set.add(parsed);
}

function addLegacyRoleAssignment(
  assignments: LegacyRoleAssignment[],
  value: number | null | undefined,
  priority: number,
  source: string,
) {
  if (typeof value === "number" && Number.isFinite(value)) {
    assignments.push({ roleId: value, priority, source });
  }
}

function rankLegacyPriority(rank: DeveloperRank) {
  const index = DEVELOPER_RANKS.indexOf(rank);
  return index >= 0 ? index + 1 : 0;
}

function projectAccessLegacyPriority(accessLevel: ProjectAccessLevel) {
  const index = PROJECT_ACCESS_LEVELS.indexOf(accessLevel);
  return index >= 0 ? index + 1 : 0;
}

function projectRoleId(project: DevProject, accessLevel: ProjectAccessLevel) {
  if (accessLevel === "PUBLISHER") return project.robloxPublisherRoleId;
  if (accessLevel === "DEVELOPER") return project.robloxDeveloperRoleId;
  return project.robloxContributorRoleId;
}

function projectLegacyRoleId(
  project: DevProject,
  accessLevel: ProjectAccessLevel,
) {
  if (accessLevel === "PUBLISHER") return project.robloxPublisherLegacyRoleId;
  if (accessLevel === "DEVELOPER") return project.robloxDeveloperLegacyRoleId;
  return project.robloxContributorLegacyRoleId;
}

function projectDiscordRoleId(
  project: DevProject,
  accessLevel: ProjectAccessLevel,
) {
  if (accessLevel === "PUBLISHER") return project.discordPublisherRoleId;
  if (accessLevel === "DEVELOPER") return project.discordDeveloperRoleId;
  return project.discordContributorRoleId;
}

function canReceiveProjectRobloxAccess(
  rank: DeveloperRank,
  membership: ProjectMembership,
) {
  return rankAtLeast(rank, "DEVELOPER") || membership.allowJuniorRobloxAccess;
}

function addHistoricalManagedRoles(
  plan: AccessPlan,
  managedRoles: AccessManagedRole[],
) {
  for (const role of managedRoles) {
    if (
      role.platform === "ROBLOX_OPEN_CLOUD" &&
      role.scope === MANAGED_ROLE_SCOPES.development
    ) {
      addIfPresent(plan.robloxManagedDevelopmentRoleIds, role.roleId);
    }
    if (
      role.platform === "ROBLOX_OPEN_CLOUD" &&
      role.scope === MANAGED_ROLE_SCOPES.publisher
    ) {
      addIfPresent(plan.robloxManagedPublisherRoleIds, role.roleId);
    }
    if (
      role.platform === "ROBLOX_LEGACY" &&
      role.scope === MANAGED_ROLE_SCOPES.development
    ) {
      addNumericStringIfPresent(
        plan.robloxManagedDevelopmentLegacyRoleIds,
        role.roleId,
      );
    }
    if (
      role.platform === "ROBLOX_LEGACY" &&
      role.scope === MANAGED_ROLE_SCOPES.publisher
    ) {
      addNumericStringIfPresent(
        plan.robloxManagedPublisherLegacyRoleIds,
        role.roleId,
      );
    }
    if (
      role.platform === "DISCORD" &&
      role.scope === MANAGED_ROLE_SCOPES.discord
    ) {
      addIfPresent(plan.discordManagedRoleIds, role.roleId);
    }
    if (
      role.platform === "LINEAR" &&
      role.scope === MANAGED_ROLE_SCOPES.linearProject
    ) {
      addIfPresent(plan.linearManagedProjectIds, role.roleId);
    }
    if (
      role.platform === "LINEAR" &&
      role.scope === MANAGED_ROLE_SCOPES.linearTeam
    ) {
      addIfPresent(plan.linearManagedTeamIds, role.roleId);
    }
  }
}

async function collectConnectionNodes<T>(connection: PageableConnection<T>) {
  let current = connection;
  let seen = current.nodes.length;
  const nodes = [...current.nodes];

  while (current.pageInfo.hasNextPage) {
    current = await current.fetchNext();
    nodes.push(...current.nodes.slice(seen));
    seen = current.nodes.length;
  }

  return nodes;
}

function buildAccessPlan(params: {
  user: UserForSync;
  rankMappings: RankRoleMapping[];
  specialtyMappings: SpecialtyRoleMapping[];
  projects: DevProject[];
  managedRoles: AccessManagedRole[];
}): AccessPlan {
  const plan: AccessPlan = {
    robloxDevelopmentRoleIds: new Set(),
    robloxManagedDevelopmentRoleIds: new Set(),
    robloxPublisherRoleIds: new Set(),
    robloxManagedPublisherRoleIds: new Set(),
    robloxDevelopmentLegacyRoles: [],
    robloxActiveDevelopmentLegacyRoleIds: new Set(),
    robloxManagedDevelopmentLegacyRoleIds: new Set(),
    robloxPublisherLegacyRoles: [],
    robloxActivePublisherLegacyRoleIds: new Set(),
    robloxManagedPublisherLegacyRoleIds: new Set(),
    discordRoleIds: new Set(),
    discordManagedRoleIds: new Set(),
    linearProjectMemberIds: new Set(),
    linearManagedProjectIds: new Set(),
    linearTeamIds: new Set(),
    linearManagedTeamIds: new Set(),
  };

  for (const mapping of params.rankMappings) {
    addIfPresent(plan.robloxManagedDevelopmentRoleIds, mapping.robloxRoleId);
    addNumberIfPresent(
      plan.robloxActiveDevelopmentLegacyRoleIds,
      mapping.robloxLegacyRoleId,
    );
    addNumberIfPresent(
      plan.robloxManagedDevelopmentLegacyRoleIds,
      mapping.robloxLegacyRoleId,
    );
    addIfPresent(plan.discordManagedRoleIds, mapping.discordRoleId);
    if (mapping.rank === params.user.developerRank) {
      addIfPresent(plan.robloxDevelopmentRoleIds, mapping.robloxRoleId);
      addLegacyRoleAssignment(
        plan.robloxDevelopmentLegacyRoles,
        mapping.robloxLegacyRoleId,
        rankLegacyPriority(mapping.rank),
        `rank:${mapping.rank}`,
      );
      addIfPresent(plan.discordRoleIds, mapping.discordRoleId);
    }
  }

  for (const mapping of params.specialtyMappings) {
    addIfPresent(plan.discordManagedRoleIds, mapping.discordRoleId);
    if (
      params.user.specialties.includes(mapping.specialty as DeveloperSpecialty)
    ) {
      addIfPresent(plan.discordRoleIds, mapping.discordRoleId);
    }
  }

  for (const project of params.projects) {
    addIfPresent(
      plan.robloxManagedPublisherRoleIds,
      project.robloxContributorRoleId,
    );
    addIfPresent(
      plan.robloxManagedPublisherRoleIds,
      project.robloxDeveloperRoleId,
    );
    addIfPresent(
      plan.robloxManagedPublisherRoleIds,
      project.robloxPublisherRoleId,
    );
    addNumberIfPresent(
      plan.robloxActivePublisherLegacyRoleIds,
      project.robloxContributorLegacyRoleId,
    );
    addNumberIfPresent(
      plan.robloxManagedPublisherLegacyRoleIds,
      project.robloxContributorLegacyRoleId,
    );
    addNumberIfPresent(
      plan.robloxActivePublisherLegacyRoleIds,
      project.robloxDeveloperLegacyRoleId,
    );
    addNumberIfPresent(
      plan.robloxManagedPublisherLegacyRoleIds,
      project.robloxDeveloperLegacyRoleId,
    );
    addNumberIfPresent(
      plan.robloxActivePublisherLegacyRoleIds,
      project.robloxPublisherLegacyRoleId,
    );
    addNumberIfPresent(
      plan.robloxManagedPublisherLegacyRoleIds,
      project.robloxPublisherLegacyRoleId,
    );
    addIfPresent(plan.discordManagedRoleIds, project.discordContributorRoleId);
    addIfPresent(plan.discordManagedRoleIds, project.discordDeveloperRoleId);
    addIfPresent(plan.discordManagedRoleIds, project.discordPublisherRoleId);
    addIfPresent(plan.linearManagedProjectIds, project.linearProjectId);
    addIfPresent(plan.linearManagedTeamIds, project.linearTeamId);
  }

  for (const membership of params.user.projectMemberships) {
    if (!membership.project.isActive) continue;

    addIfPresent(
      plan.discordRoleIds,
      projectDiscordRoleId(membership.project, membership.accessLevel),
    );

    if (canReceiveProjectRobloxAccess(params.user.developerRank, membership)) {
      addIfPresent(
        plan.robloxPublisherRoleIds,
        projectRoleId(membership.project, membership.accessLevel),
      );
      addLegacyRoleAssignment(
        plan.robloxPublisherLegacyRoles,
        projectLegacyRoleId(membership.project, membership.accessLevel),
        projectAccessLegacyPriority(membership.accessLevel),
        `project:${membership.projectId}:${membership.accessLevel}`,
      );
    }

    addIfPresent(
      plan.linearProjectMemberIds,
      membership.project.linearProjectId,
    );
    addIfPresent(plan.linearTeamIds, membership.project.linearTeamId);
  }

  addHistoricalManagedRoles(plan, params.managedRoles);

  return plan;
}

function robloxOpenCloudHeaders() {
  const apiKey = process.env.ROBLOX_OPEN_CLOUD_API_KEY;
  const bearerToken = process.env.ROBLOX_OPEN_CLOUD_TOKEN;
  if (!apiKey && !bearerToken) return null;

  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
    ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
  };
}

async function robloxOpenCloudFetch(path: string, options: RequestInit = {}) {
  const headers = robloxOpenCloudHeaders();
  if (!headers) throw new Error("ROBLOX_OPEN_CLOUD_API_KEY is not set");

  return fetch(`https://apis.roblox.com/cloud/v2${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

function rolePath(groupId: string, roleId: string) {
  return `groups/${groupId}/roles/${roleId}`;
}

function roleIdFromPath(path: unknown) {
  if (typeof path !== "string") return null;
  return path.split("/").pop() ?? null;
}

function membershipIdFromPath(path: string) {
  return path.split("/").pop() ?? path;
}

async function assertOpenCloudMutationOk(response: Response, action: string) {
  if (!response.ok) {
    throw new Error(
      `Roblox Open Cloud ${action} failed (${response.status}): ${await response.text()}`,
    );
  }
}

async function syncRobloxOpenCloud(params: {
  groupName: string;
  groupId: string | null;
  user: UserForSync;
  desiredRoleIds: Set<string>;
  managedRoleIds: Set<string>;
  dryRun: boolean;
}): Promise<SyncResult> {
  if (!params.groupId) {
    return {
      platform: "ROBLOX_OPEN_CLOUD",
      status: "SKIPPED",
      action: `Roblox Open Cloud skipped: ${params.groupName} group ID is not configured`,
    };
  }
  if (!params.user.robloxId) {
    return {
      platform: "ROBLOX_OPEN_CLOUD",
      status: "SKIPPED",
      action: "Roblox Open Cloud skipped: user has no linked Roblox account",
    };
  }
  if (!robloxOpenCloudHeaders()) {
    return {
      platform: "ROBLOX_OPEN_CLOUD",
      status: "SKIPPED",
      action: "Roblox Open Cloud skipped: API key is not configured",
    };
  }

  const filter = encodeURIComponent(`user == 'users/${params.user.robloxId}'`);
  const response = await robloxOpenCloudFetch(
    `/groups/${params.groupId}/memberships?maxPageSize=10&filter=${filter}`,
  );
  if (!response.ok) {
    throw new Error(
      `Roblox membership lookup failed (${response.status}): ${await response.text()}`,
    );
  }

  const data = (await response.json()) as {
    groupMemberships?: Array<{
      path: string;
      role?: string;
      roles?: string[];
    }>;
  };
  const membership = data.groupMemberships?.[0];
  if (!membership) {
    return {
      platform: "ROBLOX_OPEN_CLOUD",
      status: "SKIPPED",
      action: `Roblox Open Cloud skipped: user is not in the ${params.groupName} group`,
    };
  }

  const currentRoleIds = new Set<string>();
  addIfPresent(currentRoleIds, roleIdFromPath(membership.role));
  for (const role of membership.roles ?? []) {
    addIfPresent(currentRoleIds, roleIdFromPath(role));
  }

  const toAssign = [...params.desiredRoleIds].filter(
    (roleId) => !currentRoleIds.has(roleId),
  );
  const toUnassign = [...currentRoleIds].filter(
    (roleId) =>
      params.managedRoleIds.has(roleId) && !params.desiredRoleIds.has(roleId),
  );

  if (!params.dryRun) {
    const membershipId = membershipIdFromPath(membership.path);
    for (const roleId of toUnassign) {
      const response = await robloxOpenCloudFetch(
        `/groups/${params.groupId}/memberships/${membershipId}:unassignRole`,
        {
          method: "POST",
          body: JSON.stringify({ role: rolePath(params.groupId, roleId) }),
        },
      );
      await assertOpenCloudMutationOk(response, `role unassign ${roleId}`);
    }
    for (const roleId of toAssign) {
      const response = await robloxOpenCloudFetch(
        `/groups/${params.groupId}/memberships/${membershipId}:assignRole`,
        {
          method: "POST",
          body: JSON.stringify({ role: rolePath(params.groupId, roleId) }),
        },
      );
      await assertOpenCloudMutationOk(response, `role assign ${roleId}`);
    }
  }

  return {
    platform: "ROBLOX_OPEN_CLOUD",
    status: "SUCCESS",
    action: params.dryRun
      ? `Roblox Open Cloud ${params.groupName} dry run completed`
      : `Roblox Open Cloud ${params.groupName} roles synced`,
    details: { groupName: params.groupName, toAssign, toUnassign },
  };
}

async function robloxLegacyFetch(
  url: string,
  options: RequestInit,
  csrfToken?: string,
): Promise<Response> {
  const cookie = process.env.ROBLOX_LEGACY_COOKIE;
  if (!cookie) throw new Error("ROBLOX_LEGACY_COOKIE is not set");

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie.includes(".ROBLOSECURITY")
        ? cookie
        : `.ROBLOSECURITY=${cookie}`,
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (response.status === 403 && !csrfToken) {
    const token = response.headers.get("x-csrf-token");
    if (token) return robloxLegacyFetch(url, options, token);
  }

  return response;
}

function selectLegacyRoleAssignment(
  groupName: string,
  assignments: LegacyRoleAssignment[],
) {
  if (!assignments.length) return null;

  const priority = Math.max(...assignments.map((item) => item.priority));
  const highestPriorityAssignments = assignments.filter(
    (item) => item.priority === priority,
  );
  const roleIds = [
    ...new Set(highestPriorityAssignments.map((item) => item.roleId)),
  ];

  if (roleIds.length > 1) {
    throw new Error(
      `Ambiguous Roblox legacy ${groupName} role IDs at the same precedence: ${roleIds.join(
        ", ",
      )}. Legacy groups can only assign one role; make same-precedence mappings share one role ID or disable legacy sync for this group.`,
    );
  }

  return {
    roleId: roleIds[0],
    priority,
    sources: highestPriorityAssignments.map((item) => item.source),
  };
}

async function getRobloxLegacyMembershipRole(params: {
  groupId: string;
  userId: string;
}) {
  const response = await robloxLegacyFetch(
    `https://groups.roblox.com/v2/users/${params.userId}/groups/roles`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error(
      `Roblox legacy membership lookup failed (${response.status}): ${await response.text()}`,
    );
  }

  const data = (await response.json()) as {
    data?: Array<{
      group?: { id?: number | string };
      role?: { id?: number | string; name?: string; rank?: number };
    }>;
  };
  const membership = data.data?.find(
    (item) => String(item.group?.id) === params.groupId,
  );
  if (!membership) return null;

  const roleId = Number(membership.role?.id);
  return {
    roleId: Number.isFinite(roleId) ? roleId : null,
    roleName: membership.role?.name ?? null,
    roleRank:
      typeof membership.role?.rank === "number" ? membership.role.rank : null,
  };
}

async function syncRobloxLegacy(params: {
  groupName: string;
  groupId: string | null;
  user: UserForSync;
  desiredRoles: LegacyRoleAssignment[];
  activeRoleIds: Set<number>;
  managedRoleIds: Set<number>;
  fallbackRoleId: number | null;
  dryRun: boolean;
}): Promise<SyncResult> {
  if (!params.groupId) {
    return {
      platform: "ROBLOX_LEGACY",
      status: "SKIPPED",
      action: `Roblox legacy skipped: ${params.groupName} group ID is not configured`,
    };
  }
  if (!params.user.robloxId) {
    return {
      platform: "ROBLOX_LEGACY",
      status: "SKIPPED",
      action: "Roblox legacy skipped: user has no linked Roblox account",
    };
  }
  if (!process.env.ROBLOX_LEGACY_COOKIE) {
    return {
      platform: "ROBLOX_LEGACY",
      status: "SKIPPED",
      action: "Roblox legacy skipped: cookie is not configured",
    };
  }

  if (!params.desiredRoles.length && !params.managedRoleIds.size) {
    return {
      platform: "ROBLOX_LEGACY",
      status: "SKIPPED",
      action: `Roblox legacy skipped: no mapped ${params.groupName} legacy role ID`,
    };
  }

  const membership = await getRobloxLegacyMembershipRole({
    groupId: params.groupId,
    userId: params.user.robloxId,
  });
  if (!membership) {
    return {
      platform: "ROBLOX_LEGACY",
      status: "SKIPPED",
      action: `Roblox legacy skipped: user is not in the ${params.groupName} group`,
    };
  }

  const selection = selectLegacyRoleAssignment(
    params.groupName,
    params.desiredRoles,
  );
  let desiredRoleId = selection?.roleId ?? null;
  let actionKind: "assign" | "demote" | "none" = selection ? "assign" : "none";

  if (!selection) {
    const currentRoleIsManaged =
      typeof membership.roleId === "number" &&
      params.managedRoleIds.has(membership.roleId);

    if (!currentRoleIsManaged) {
      return {
        platform: "ROBLOX_LEGACY",
        status: "SUCCESS",
        action: `Roblox legacy ${params.groupName} has no managed role to revoke`,
        details: {
          groupName: params.groupName,
          currentRoleId: membership.roleId,
          currentRoleName: membership.roleName,
          managedRoleIds: [...params.managedRoleIds],
        },
      };
    }

    if (!params.fallbackRoleId) {
      throw new Error(
        `Roblox legacy ${params.groupName} fallback role ID is not configured; cannot revoke managed role ${membership.roleId}`,
      );
    }

    if (params.activeRoleIds.has(params.fallbackRoleId)) {
      throw new Error(
        `Roblox legacy ${params.groupName} fallback role ID ${params.fallbackRoleId} is also an active managed role ID`,
      );
    }

    desiredRoleId = params.fallbackRoleId;
    actionKind = "demote";
  }

  if (typeof desiredRoleId !== "number") {
    throw new Error(
      `Roblox legacy ${params.groupName} desired role could not be resolved`,
    );
  }

  const alreadySynced = membership.roleId === desiredRoleId;
  if (!params.dryRun && !alreadySynced) {
    const response = await robloxLegacyFetch(
      `https://groups.roblox.com/v1/groups/${params.groupId}/users/${params.user.robloxId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ roleId: desiredRoleId }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Roblox legacy role update failed (${response.status}): ${await response.text()}`,
      );
    }
  }

  return {
    platform: "ROBLOX_LEGACY",
    status: "SUCCESS",
    action: params.dryRun
      ? `Roblox legacy ${params.groupName} dry run completed`
      : alreadySynced
        ? `Roblox legacy ${params.groupName} role already synced`
        : `Roblox legacy ${params.groupName} role synced`,
    details: {
      groupName: params.groupName,
      currentRoleId: membership.roleId,
      currentRoleName: membership.roleName,
      currentRoleRank: membership.roleRank,
      desiredRoleId,
      fallbackRoleId: params.fallbackRoleId,
      managedRoleIds: [...params.managedRoleIds],
      selectedSources: selection?.sources ?? [],
      actionKind,
    },
  };
}

async function discordFetch(path: string, options: RequestInit = {}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");

  return fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

async function syncDiscord(params: {
  guildId: string | null;
  user: UserForSync;
  plan: AccessPlan;
  dryRun: boolean;
}): Promise<SyncResult> {
  if (!params.guildId) {
    return {
      platform: "DISCORD",
      status: "SKIPPED",
      action: "Discord skipped: guild ID is not configured",
    };
  }
  if (!params.user.discordId) {
    return {
      platform: "DISCORD",
      status: "SKIPPED",
      action: "Discord skipped: user has no linked Discord account",
    };
  }
  if (!process.env.DISCORD_BOT_TOKEN) {
    return {
      platform: "DISCORD",
      status: "SKIPPED",
      action: "Discord skipped: bot token is not configured",
    };
  }

  const memberResponse = await discordFetch(
    `/guilds/${params.guildId}/members/${params.user.discordId}`,
  );
  if (memberResponse.status === 404) {
    return {
      platform: "DISCORD",
      status: "SKIPPED",
      action: "Discord skipped: user is not in the configured server",
    };
  }
  if (!memberResponse.ok) {
    throw new Error(
      `Discord member lookup failed (${memberResponse.status}): ${await memberResponse.text()}`,
    );
  }

  const member = (await memberResponse.json()) as { roles?: string[] };
  const currentRoleIds = new Set(member.roles ?? []);
  const toAdd = [...params.plan.discordRoleIds].filter(
    (roleId) => !currentRoleIds.has(roleId),
  );
  const toRemove = [...currentRoleIds].filter(
    (roleId) =>
      params.plan.discordManagedRoleIds.has(roleId) &&
      !params.plan.discordRoleIds.has(roleId),
  );

  if (!params.dryRun) {
    for (const roleId of toRemove) {
      const response = await discordFetch(
        `/guilds/${params.guildId}/members/${params.user.discordId}/roles/${roleId}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(
          `Discord role removal failed (${response.status}): ${await response.text()}`,
        );
      }
    }
    for (const roleId of toAdd) {
      const response = await discordFetch(
        `/guilds/${params.guildId}/members/${params.user.discordId}/roles/${roleId}`,
        { method: "PUT" },
      );
      if (!response.ok) {
        throw new Error(
          `Discord role assignment failed (${response.status}): ${await response.text()}`,
        );
      }
    }
  }

  return {
    platform: "DISCORD",
    status: "SUCCESS",
    action: params.dryRun
      ? "Discord dry run completed"
      : "Discord roles synced",
    details: { toAdd, toRemove },
  };
}

async function syncLinear(params: {
  actorId: string;
  user: UserForSync;
  plan: AccessPlan;
  dryRun: boolean;
}): Promise<SyncResult> {
  if (!params.user.linearId) {
    return {
      platform: "LINEAR",
      status: "SKIPPED",
      action: "Linear skipped: user has no linked Linear account",
    };
  }

  const projectIdsToAdd = [...params.plan.linearProjectMemberIds];
  const teamIdsToAdd = [...params.plan.linearTeamIds];
  const managedProjectIds = [...params.plan.linearManagedProjectIds];
  const managedTeamIds = [...params.plan.linearManagedTeamIds];

  if (!managedProjectIds.length && !managedTeamIds.length) {
    return {
      platform: "LINEAR",
      status: "SKIPPED",
      action: "Linear skipped: no Linear teams or projects are configured",
    };
  }

  if (!params.dryRun) {
    await withLinearFallback(params.actorId, async (client) => {
      for (const projectId of managedProjectIds) {
        const project = await client.project(projectId);
        const members = await collectConnectionNodes(
          await project.members({ first: 100 }),
        );
        const nextMemberIds = new Set(members.map((member) => member.id));
        if (params.plan.linearProjectMemberIds.has(projectId)) {
          nextMemberIds.add(params.user.linearId as string);
        } else {
          nextMemberIds.delete(params.user.linearId as string);
        }
        await client.updateProject(projectId, {
          memberIds: [...nextMemberIds],
        });
      }

      const linearUser = await client.user(params.user.linearId as string);
      const memberships = await collectConnectionNodes(
        await linearUser.teamMemberships({ first: 100 }),
      );
      const existingMemberships = memberships.filter((membership) =>
        managedTeamIds.includes(membership.teamId ?? ""),
      );
      const existingTeamIds = new Set(
        existingMemberships
          .map((membership) => membership.teamId)
          .filter((teamId): teamId is string => !!teamId),
      );

      for (const membership of existingMemberships) {
        if (
          membership.teamId &&
          !params.plan.linearTeamIds.has(membership.teamId)
        ) {
          await membership.delete();
        }
      }

      for (const teamId of teamIdsToAdd) {
        if (!existingTeamIds.has(teamId)) {
          await client.createTeamMembership({
            teamId,
            userId: params.user.linearId as string,
          });
        }
      }
    });
  }

  return {
    platform: "LINEAR",
    status: "SUCCESS",
    action: params.dryRun ? "Linear dry run completed" : "Linear access synced",
    details: {
      projectIdsToAdd,
      teamIdsToAdd,
      managedProjectIds,
      managedTeamIds,
    },
  };
}

async function recordSyncLog(params: {
  userId: string;
  actorId: string | null;
  dryRun: boolean;
  result: SyncResult;
}) {
  await prisma.accessSyncLog.create({
    data: {
      userId: params.userId,
      actorId: params.actorId,
      dryRun: params.dryRun,
      platform: params.result.platform,
      status: params.result.status,
      action: params.result.action,
      details: params.result.details ?? undefined,
      error: params.result.error ?? null,
    },
  });
}

async function runPlatformSync(
  fn: () => Promise<SyncResult>,
  platform: AccessSyncPlatform,
): Promise<SyncResult> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof LinearReauthRequiredError) {
      return {
        platform,
        status: "FAILED",
        action: "Linear reauthentication required",
        error: error.message,
      };
    }
    return {
      platform,
      status: "FAILED",
      action: `${platform} sync failed`,
      error: error instanceof Error ? error.message : "Unknown sync error",
    };
  }
}

export async function revokeLinkedAccountAccess(params: {
  userId: string;
  providerId: LinkedAccessProvider;
  externalAccountId: string;
}) {
  const externalAccountId = clean(params.externalAccountId);
  if (!externalAccountId) return [];

  const [
    config,
    user,
    rankMappings,
    specialtyMappings,
    projects,
    managedRoles,
  ] = await Promise.all([
    prisma.accessIntegrationConfig.findUnique({ where: { id: "default" } }),
    prisma.userProfile.findUnique({
      where: { id: params.userId },
      include: {
        projectMemberships: {
          include: { project: true },
        },
      },
    }),
    prisma.rankRoleMapping.findMany(),
    prisma.specialtyRoleMapping.findMany(),
    prisma.devProject.findMany(),
    prisma.accessManagedRole.findMany(),
  ]);

  if (!user) throw new Error("User not found");
  if (!config) return [];

  const userForRevocation: UserForSync = {
    ...user,
    discordId:
      params.providerId === "discord" ? externalAccountId : user.discordId,
    robloxId:
      params.providerId === "roblox" ? externalAccountId : user.robloxId,
  };

  const plan = buildAccessPlan({
    user: userForRevocation,
    rankMappings,
    specialtyMappings,
    projects,
    managedRoles,
  });

  const dryRun = false;
  const results: SyncResult[] = [];

  if (params.providerId === "discord") {
    plan.discordRoleIds.clear();
    if (
      config?.discordEnabled !== false &&
      plan.discordManagedRoleIds.size > 0
    ) {
      results.push(
        await runPlatformSync(
          () =>
            syncDiscord({
              guildId: config?.discordGuildId ?? null,
              user: userForRevocation,
              plan,
              dryRun,
            }),
          "DISCORD",
        ),
      );
    }
  }

  if (params.providerId === "roblox") {
    plan.robloxDevelopmentRoleIds.clear();
    plan.robloxPublisherRoleIds.clear();
    plan.robloxDevelopmentLegacyRoles = [];
    plan.robloxPublisherLegacyRoles = [];

    if (config?.robloxOpenCloudEnabled !== false) {
      if (plan.robloxManagedDevelopmentRoleIds.size > 0) {
        results.push(
          await runPlatformSync(
            () =>
              syncRobloxOpenCloud({
                groupName: "development",
                groupId: config?.robloxDevelopmentGroupId ?? null,
                desiredRoleIds: plan.robloxDevelopmentRoleIds,
                managedRoleIds: plan.robloxManagedDevelopmentRoleIds,
                user: userForRevocation,
                dryRun,
              }),
            "ROBLOX_OPEN_CLOUD",
          ),
        );
      }
      if (plan.robloxManagedPublisherRoleIds.size > 0) {
        results.push(
          await runPlatformSync(
            () =>
              syncRobloxOpenCloud({
                groupName: "publisher",
                groupId: config?.robloxPublisherGroupId ?? null,
                desiredRoleIds: plan.robloxPublisherRoleIds,
                managedRoleIds: plan.robloxManagedPublisherRoleIds,
                user: userForRevocation,
                dryRun,
              }),
            "ROBLOX_OPEN_CLOUD",
          ),
        );
      }
    }

    if (config?.robloxLegacyEnabled) {
      if (plan.robloxManagedDevelopmentLegacyRoleIds.size > 0) {
        results.push(
          await runPlatformSync(
            () =>
              syncRobloxLegacy({
                groupName: "development",
                groupId: config?.robloxDevelopmentGroupId ?? null,
                desiredRoles: plan.robloxDevelopmentLegacyRoles,
                activeRoleIds: plan.robloxActiveDevelopmentLegacyRoleIds,
                managedRoleIds: plan.robloxManagedDevelopmentLegacyRoleIds,
                fallbackRoleId:
                  config?.robloxDevelopmentLegacyFallbackRoleId ?? null,
                user: userForRevocation,
                dryRun,
              }),
            "ROBLOX_LEGACY",
          ),
        );
      }
      if (plan.robloxManagedPublisherLegacyRoleIds.size > 0) {
        results.push(
          await runPlatformSync(
            () =>
              syncRobloxLegacy({
                groupName: "publisher",
                groupId: config?.robloxPublisherGroupId ?? null,
                desiredRoles: plan.robloxPublisherLegacyRoles,
                activeRoleIds: plan.robloxActivePublisherLegacyRoleIds,
                managedRoleIds: plan.robloxManagedPublisherLegacyRoleIds,
                fallbackRoleId:
                  config?.robloxPublisherLegacyFallbackRoleId ?? null,
                user: userForRevocation,
                dryRun,
              }),
            "ROBLOX_LEGACY",
          ),
        );
      }
    }
  }

  for (const result of results) {
    await recordSyncLog({
      userId: params.userId,
      actorId: null,
      dryRun,
      result,
    });
  }

  return results;
}

export async function syncUserAccess(
  userId: string,
  actorId: string | null,
  options: SyncOptions = {},
) {
  const dryRun = !!options.dryRun;

  const [
    config,
    user,
    rankMappings,
    specialtyMappings,
    projects,
    managedRoles,
  ] = await Promise.all([
    prisma.accessIntegrationConfig.findUnique({ where: { id: "default" } }),
    prisma.userProfile.findUnique({
      where: { id: userId },
      include: {
        projectMemberships: {
          include: { project: true },
        },
      },
    }),
    prisma.rankRoleMapping.findMany(),
    prisma.specialtyRoleMapping.findMany(),
    prisma.devProject.findMany(),
    prisma.accessManagedRole.findMany(),
  ]);

  if (!user) throw new Error("User not found");

  const plan = buildAccessPlan({
    user,
    rankMappings,
    specialtyMappings,
    projects,
    managedRoles,
  });

  const results: SyncResult[] = [];
  if (config?.robloxOpenCloudEnabled !== false) {
    results.push(
      await runPlatformSync(
        () =>
          syncRobloxOpenCloud({
            groupName: "development",
            groupId: config?.robloxDevelopmentGroupId ?? null,
            desiredRoleIds: plan.robloxDevelopmentRoleIds,
            managedRoleIds: plan.robloxManagedDevelopmentRoleIds,
            user,
            dryRun,
          }),
        "ROBLOX_OPEN_CLOUD",
      ),
      await runPlatformSync(
        () =>
          syncRobloxOpenCloud({
            groupName: "publisher",
            groupId: config?.robloxPublisherGroupId ?? null,
            desiredRoleIds: plan.robloxPublisherRoleIds,
            managedRoleIds: plan.robloxManagedPublisherRoleIds,
            user,
            dryRun,
          }),
        "ROBLOX_OPEN_CLOUD",
      ),
    );
  }
  if (config?.robloxLegacyEnabled) {
    results.push(
      await runPlatformSync(
        () =>
          syncRobloxLegacy({
            groupName: "development",
            groupId: config?.robloxDevelopmentGroupId ?? null,
            desiredRoles: plan.robloxDevelopmentLegacyRoles,
            activeRoleIds: plan.robloxActiveDevelopmentLegacyRoleIds,
            managedRoleIds: plan.robloxManagedDevelopmentLegacyRoleIds,
            fallbackRoleId:
              config?.robloxDevelopmentLegacyFallbackRoleId ?? null,
            user,
            dryRun,
          }),
        "ROBLOX_LEGACY",
      ),
      await runPlatformSync(
        () =>
          syncRobloxLegacy({
            groupName: "publisher",
            groupId: config?.robloxPublisherGroupId ?? null,
            desiredRoles: plan.robloxPublisherLegacyRoles,
            activeRoleIds: plan.robloxActivePublisherLegacyRoleIds,
            managedRoleIds: plan.robloxManagedPublisherLegacyRoleIds,
            fallbackRoleId: config?.robloxPublisherLegacyFallbackRoleId ?? null,
            user,
            dryRun,
          }),
        "ROBLOX_LEGACY",
      ),
    );
  }
  if (config?.discordEnabled !== false) {
    results.push(
      await runPlatformSync(
        () =>
          syncDiscord({
            guildId: config?.discordGuildId ?? null,
            user,
            plan,
            dryRun,
          }),
        "DISCORD",
      ),
    );
  }
  if (config?.linearEnabled !== false && actorId) {
    results.push(
      await runPlatformSync(
        () => syncLinear({ actorId, user, plan, dryRun }),
        "LINEAR",
      ),
    );
  }

  for (const result of results) {
    await recordSyncLog({ userId, actorId, dryRun, result });
  }

  return results;
}

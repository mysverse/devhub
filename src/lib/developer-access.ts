export const DEVELOPER_RANKS = [
  "PROBATIONARY_DEVELOPER",
  "JUNIOR_DEVELOPER",
  "DEVELOPER",
  "SENIOR_DEVELOPER",
  "DEVELOPER_COUNCIL",
  "HEAD_DEVELOPER",
] as const;

export type DeveloperRankValue = (typeof DEVELOPER_RANKS)[number];

export const DEVELOPER_RANK_LABELS: Record<DeveloperRankValue, string> = {
  PROBATIONARY_DEVELOPER: "Probationary Developer",
  JUNIOR_DEVELOPER: "Junior Developer",
  DEVELOPER: "Developer",
  SENIOR_DEVELOPER: "Senior Developer",
  DEVELOPER_COUNCIL: "Developer Council",
  HEAD_DEVELOPER: "Head Developer",
};

export const ADMIN_DEVELOPER_RANKS = [
  "DEVELOPER_COUNCIL",
  "HEAD_DEVELOPER",
] as const satisfies readonly DeveloperRankValue[];

export const DEVELOPER_SPECIALTIES = [
  "SCRIPTING",
  "BUILDING",
  "MESHING",
  "VEHICLES",
] as const;

export type DeveloperSpecialtyValue = (typeof DEVELOPER_SPECIALTIES)[number];

export const DEVELOPER_SPECIALTY_LABELS: Record<
  DeveloperSpecialtyValue,
  string
> = {
  SCRIPTING: "Scripting",
  BUILDING: "Building",
  MESHING: "Meshing",
  VEHICLES: "Vehicles",
};

export const PROJECT_ACCESS_LEVELS = [
  "CONTRIBUTOR",
  "DEVELOPER",
  "PUBLISHER",
] as const;

export type ProjectAccessLevelValue = (typeof PROJECT_ACCESS_LEVELS)[number];

export const PROJECT_ACCESS_LEVEL_LABELS: Record<
  ProjectAccessLevelValue,
  string
> = {
  CONTRIBUTOR: "Contributor",
  DEVELOPER: "Developer",
  PUBLISHER: "Publisher",
};

const RANK_ORDER = new Map<DeveloperRankValue, number>(
  DEVELOPER_RANKS.map((rank, index) => [rank, index]),
);

export function rankAtLeast(
  rank: DeveloperRankValue,
  minimum: DeveloperRankValue,
): boolean {
  return (RANK_ORDER.get(rank) ?? 0) >= (RANK_ORDER.get(minimum) ?? 0);
}

export function isDeveloperAdminRank(rank: string | null | undefined) {
  return ADMIN_DEVELOPER_RANKS.some((adminRank) => adminRank === rank);
}

export function getProbationReviewDates(start = new Date()) {
  const initialReviewAt = new Date(start);
  initialReviewAt.setMonth(initialReviewAt.getMonth() + 3);

  const finalReviewAt = new Date(start);
  finalReviewAt.setMonth(finalReviewAt.getMonth() + 6);

  return {
    probationStartedAt: start,
    initialReviewAt,
    finalReviewAt,
  };
}

/**
 * Who counts as an admin. Lives here rather than in authz.ts because that
 * module imports Prisma and throws at load time without a DATABASE_URL, which
 * would make these — the most security-relevant predicates in the app —
 * untestable. authz.ts re-exports both.
 */
export function hasAdminAccess(
  profile: {
    role: string;
    developerRank?: string | null;
  } | null,
) {
  return (
    profile?.role === "ADMIN" || isDeveloperAdminRank(profile?.developerRank)
  );
}

/**
 * The query-side twin of hasAdminAccess(), used to fan out admin
 * notifications. src/lib/authz.test.ts asserts the two cannot drift apart:
 * a rank in one but not the other silently splits "receives admin mail" from
 * "may act as an admin".
 */
export const ADMIN_ACCESS_WHERE = {
  OR: [
    { role: "ADMIN" as const },
    { developerRank: { in: [...ADMIN_DEVELOPER_RANKS] } },
  ],
};

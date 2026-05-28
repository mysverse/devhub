import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-utils";
import { isDevMode } from "@/lib/dev-mode";
import { isDeveloperAdminRank } from "@/lib/developer-access";

export const ADMIN_ACCESS_WHERE: Prisma.UserProfileWhereInput = {
  OR: [
    { role: "ADMIN" as const },
    { developerRank: { in: ["DEVELOPER_COUNCIL", "HEAD_DEVELOPER"] } },
  ],
};

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

export async function getCurrentUserProfileForAccess() {
  if (isDevMode()) {
    const { MOCK_USER_ID } = await import("@/lib/dev/mock-data");
    return {
      userId: MOCK_USER_ID,
      profile: { role: "ADMIN" as const, developerRank: "DEVELOPER_COUNCIL" },
    };
  }

  const { userId } = await getSession();
  if (!userId) return { userId: null, profile: null };

  const prisma = (await import("@/lib/prisma")).default;
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true, developerRank: true },
  });

  return { userId, profile };
}

export async function requireAdmin() {
  if (isDevMode()) {
    const { MOCK_USER_ID } = await import("@/lib/dev/mock-data");
    return MOCK_USER_ID;
  }

  const { userId, profile } = await getCurrentUserProfileForAccess();
  if (!userId) throw new Error("Unauthorized");
  if (!hasAdminAccess(profile)) {
    throw new Error("Forbidden: Admin access required");
  }
  return userId;
}

export async function requireAdminPage(returnTo = "/dashboard") {
  if (isDevMode()) {
    const { MOCK_USER_ID } = await import("@/lib/dev/mock-data");
    return MOCK_USER_ID;
  }

  const { userId, profile } = await getCurrentUserProfileForAccess();
  if (!userId) redirect("/sign-in");
  if (!hasAdminAccess(profile)) redirect(returnTo);
  return userId;
}

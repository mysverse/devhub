import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-utils";
import { hasAdminAccess } from "@/lib/developer-access";
import prisma from "@/lib/prisma";

// Re-exported so existing call sites keep importing authz. The definitions
// live in developer-access.ts, which is Prisma-free and therefore unit
// testable — see src/lib/authz.test.ts.
export { ADMIN_ACCESS_WHERE, hasAdminAccess } from "@/lib/developer-access";

export async function getCurrentUserProfileForAccess() {
  const { userId } = await getSession();
  if (!userId) return { userId: null, profile: null };

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true, developerRank: true },
  });

  return { userId, profile };
}

export async function requireAdmin() {
  const { userId, profile } = await getCurrentUserProfileForAccess();
  if (!userId) throw new Error("Unauthorized");
  if (!hasAdminAccess(profile)) {
    throw new Error("Forbidden: Admin access required");
  }
  return userId;
}

export async function requireAdminPage(returnTo = "/dashboard") {
  const { userId, profile } = await getCurrentUserProfileForAccess();
  if (!userId) redirect("/sign-in");
  if (!hasAdminAccess(profile)) redirect(returnTo);
  return userId;
}

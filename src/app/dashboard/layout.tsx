import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-utils";
import { hasAdminAccess } from "@/lib/authz";
import { getUserProfile } from "@/lib/user-profile";
import DashboardLayoutClient from "./DashboardLayoutClient";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await getSession();
  let isAdmin = false;

  if (userId) {
    const userProfile = await getUserProfile(userId);
    if (!userProfile) redirect("/onboarding");
    isAdmin = hasAdminAccess(userProfile);
  }

  return (
    <DashboardLayoutClient isAdmin={isAdmin}>{children}</DashboardLayoutClient>
  );
}

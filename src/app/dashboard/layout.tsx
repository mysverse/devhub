import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-utils";
import { hasAdminAccess } from "@/lib/authz";
import { getUserProfile } from "@/lib/user-profile";
import DashboardLayoutClient from "./DashboardLayoutClient";

async function getDashboardAdminStatus() {
  const { userId } = await getSession();
  if (!userId) return false;

  const userProfile = await getUserProfile(userId);
  if (!userProfile) redirect("/onboarding");
  return hasAdminAccess(userProfile);
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayoutClient adminPromise={getDashboardAdminStatus()}>
      {children}
    </DashboardLayoutClient>
  );
}

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-utils";
import { hasAdminAccess } from "@/lib/authz";
import prisma from "@/lib/prisma";
import DashboardLayoutClient from "./DashboardLayoutClient";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await getSession();
  let isAdmin = false;

  if (userId) {
    const userProfile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { role: true, developerRank: true },
    });
    if (!userProfile) redirect("/onboarding");
    isAdmin = hasAdminAccess(userProfile);
  }

  return (
    <DashboardLayoutClient isAdmin={isAdmin}>{children}</DashboardLayoutClient>
  );
}

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import DashboardLayoutClient from "./DashboardLayoutClient";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  let isAdmin = false;

  if (userId) {
    const userProfile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    isAdmin = userProfile?.role === "ADMIN";
  }

  return (
    <DashboardLayoutClient isAdmin={isAdmin}>{children}</DashboardLayoutClient>
  );
}

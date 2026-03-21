import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-utils";
import { REQUIRED_DOCUMENTS } from "@/lib/documents";
import prisma from "@/lib/prisma";
import UsersTable from "./UsersTable";

export default async function AdminUsersPage() {
  const { userId } = await getSession();
  if (!userId) redirect("/sign-in");

  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!userProfile || userProfile.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const users = await prisma.userProfile.findMany({
    include: {
      user: {
        select: { name: true, email: true, image: true },
      },
      signedDocuments: {
        select: {
          id: true,
          documentType: true,
          signedAt: true,
          coiEntries: {
            select: {
              id: true,
              organizationName: true,
              natureOfInvolvement: true,
              description: true,
            },
          },
        },
      },
      _count: {
        select: { transactions: true },
      },
    },
    orderBy: { legalName: "asc" },
  });

  const serializedUsers = users.map((u) => ({
    id: u.id,
    legalName: u.legalName,
    role: u.role,
    paymentMethod: u.paymentMethod,
    linearId: u.linearId,
    discordId: u.discordId,
    robloxId: u.robloxId,
    userName: u.user.name,
    userEmail: u.user.email,
    userImage: u.user.image,
    transactionCount: u._count.transactions,
    signedDocuments: u.signedDocuments.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      signedAt: d.signedAt.toISOString(),
      coiEntries: d.coiEntries,
    })),
  }));

  return (
    <UsersTable
      users={serializedUsers}
      requiredDocuments={REQUIRED_DOCUMENTS}
    />
  );
}

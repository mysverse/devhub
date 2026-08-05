import type { Metadata } from "next";
import { Suspense } from "react";
import LinkButton from "@/components/LinkButton";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { requireAdminPage } from "@/lib/authz";
import { resolveDisplayName } from "@/lib/display-name";
import { REQUIRED_DOCUMENTS } from "@/lib/documents";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import UsersTable from "./UsersTable";

export const metadata: Metadata = buildSocialMetadata("/dashboard/admin/users");

export default function AdminUsersPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Team Members"
        action={
          <LinkButton href="/dashboard/admin" variant="subtle">
            Back to Admin
          </LinkButton>
        }
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <AdminUsersContent />
      </Suspense>
    </PageContainer>
  );
}

async function AdminUsersContent() {
  await requireAdminPage();

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
    orderBy: { preferredName: "asc" },
  });

  const serializedUsers = users.map((u) => ({
    id: u.id,
    displayName: resolveDisplayName({ profile: u }),
    role: u.role,
    developerRank: u.developerRank,
    specialties: u.specialties,
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

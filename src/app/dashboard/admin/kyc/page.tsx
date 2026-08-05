import { Stack, Tabs, TabsList, TabsPanel, TabsTab, Text } from "@mantine/core";
import type { Metadata } from "next";
import { Suspense } from "react";
import LinkButton from "@/components/LinkButton";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { requireAdminPage } from "@/lib/authz";
import prisma from "@/lib/prisma";
import { USER_IDENTITY_SELECT } from "@/lib/prisma-select";
import { buildSocialMetadata } from "@/lib/social-previews";
import KycReviewCard from "./KycReviewCard";

export const metadata: Metadata = buildSocialMetadata("/dashboard/admin/kyc");

export default function AdminKycPage() {
  return (
    <PageContainer>
      <PageHeader
        title="KYC Review"
        subtitle="Review identity verification submissions for eWallet automatic payouts."
        action={
          <LinkButton href="/dashboard/admin" variant="subtle">
            Back to Admin
          </LinkButton>
        }
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <AdminKycContent />
      </Suspense>
    </PageContainer>
  );
}

async function AdminKycContent() {
  await requireAdminPage();

  const [pendingVerifications, recentVerifications] = await Promise.all([
    prisma.kycVerification.findMany({
      where: { status: "PENDING" },
      include: {
        user: {
          include: { user: { select: USER_IDENTITY_SELECT } },
        },
      },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.kycVerification.findMany({
      where: { status: { in: ["APPROVED", "REJECTED", "EXPIRED"] } },
      include: {
        user: {
          include: { user: { select: USER_IDENTITY_SELECT } },
        },
      },
      orderBy: { reviewedAt: "desc" },
      take: 50,
    }),
  ]);

  function toCardProps(v: (typeof pendingVerifications)[0]) {
    return {
      id: v.id,
      status: v.status,
      legalName: v.legalName,
      documentType: v.documentType,
      submittedAt: v.submittedAt.toISOString(),
      reviewedAt: v.reviewedAt?.toISOString() ?? null,
      rejectionReason: v.rejectionReason,
      documentsDeleted: v.documentsDeletedAt !== null,
      userName: v.user.user.name,
      userEmail: v.user.user.email,
    };
  }

  return (
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTab value="pending">
          Pending Review ({pendingVerifications.length})
        </TabsTab>
        <TabsTab value="recent">Recent Decisions</TabsTab>
      </TabsList>

      <TabsPanel value="pending" pt="md">
        {pendingVerifications.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No pending verifications to review.
          </Text>
        ) : (
          <Stack gap="md">
            {pendingVerifications.map((v) => (
              <KycReviewCard key={v.id} verification={toCardProps(v)} />
            ))}
          </Stack>
        )}
      </TabsPanel>

      <TabsPanel value="recent" pt="md">
        {recentVerifications.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No recent decisions.
          </Text>
        ) : (
          <Stack gap="md">
            {recentVerifications.map((v) => (
              <KycReviewCard key={v.id} verification={toCardProps(v)} />
            ))}
          </Stack>
        )}
      </TabsPanel>
    </Tabs>
  );
}

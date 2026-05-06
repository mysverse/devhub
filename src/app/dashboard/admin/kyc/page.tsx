import {
  Group,
  Stack,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  Text,
  Title,
} from "@mantine/core";
import { FadeIn } from "@/components/animations";
import LinkButton from "@/components/LinkButton";
import { requireAdminPage } from "@/lib/authz";
import prisma from "@/lib/prisma";
import KycReviewCard from "./KycReviewCard";

export default async function AdminKycPage() {
  await requireAdminPage();

  const [pendingVerifications, recentVerifications] = await Promise.all([
    prisma.kycVerification.findMany({
      where: { status: "PENDING" },
      include: {
        user: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.kycVerification.findMany({
      where: { status: { in: ["APPROVED", "REJECTED", "EXPIRED"] } },
      include: {
        user: {
          include: { user: { select: { name: true, email: true } } },
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
    <FadeIn>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1}>KYC Review</Title>
            <Text c="dimmed" mt="xs">
              Review identity verification submissions for eWallet automatic
              payouts.
            </Text>
          </div>
          <LinkButton href="/dashboard/admin" variant="subtle">
            Back to Admin
          </LinkButton>
        </Group>

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
      </Stack>
    </FadeIn>
  );
}

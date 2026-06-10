import { Box, Divider, Text, Title } from "@mantine/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import PageSkeleton from "@/components/PageSkeleton";
import { getSession } from "@/lib/auth-utils";
import { hasAdminAccess } from "@/lib/authz";
import { requiresKycForAutoPayout } from "@/lib/kyc";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import InviteGenerator from "./InviteGenerator";
import KycStatus from "./KycStatus";
import LinkedAccounts from "./LinkedAccounts";
import SettingsForm from "./SettingsForm";

export const metadata: Metadata = buildSocialMetadata("/dashboard/settings");

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const { userId } = await getSession();

  if (!userId) {
    redirect("/");
  }

  const [userProfile, linkedAccounts, latestKyc] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: userId },
    }),
    prisma.account.findMany({
      where: { userId },
      select: { providerId: true, accountId: true },
    }),
    prisma.kycVerification.findFirst({
      where: { userId },
      orderBy: { submittedAt: "desc" },
      select: { status: true, rejectionReason: true },
    }),
  ]);

  if (!userProfile) {
    redirect("/dashboard");
  }

  return (
    <StaggerContainer>
      <Box style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <StaggerItem>
          <Title order={1}>HR Settings</Title>
          <Text c="dimmed" mt="xs">
            Manage your personal information and payment preferences to receive
            your payouts.
          </Text>
        </StaggerItem>

        <StaggerItem>
          <LinkedAccounts
            linkedAccounts={linkedAccounts}
            linearEmail={userProfile.linearEmail}
            paymentMethod={userProfile.paymentMethod}
          />
        </StaggerItem>

        <StaggerItem>
          <SettingsForm
            profile={userProfile}
            robloxLinked={!!userProfile.robloxId}
          />
        </StaggerItem>

        {requiresKycForAutoPayout(userProfile.bankName) && (
          <StaggerItem>
            <KycStatus
              kycStatus={latestKyc?.status ?? null}
              kycRejectionReason={latestKyc?.rejectionReason ?? null}
              legalName={userProfile.legalName}
              autoPayoutEnabled={userProfile.autoPayoutEnabled}
            />
          </StaggerItem>
        )}

        {hasAdminAccess(userProfile) && (
          <>
            <Divider my="md" />
            <StaggerItem>
              <InviteGenerator />
            </StaggerItem>
          </>
        )}
      </Box>
    </StaggerContainer>
  );
}

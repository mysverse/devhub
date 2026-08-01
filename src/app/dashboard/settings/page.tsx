import { Divider, Stack } from "@mantine/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { getSession } from "@/lib/auth-utils";
import { hasAdminAccess } from "@/lib/authz";
import {
  getRobuxPayoutAvailability,
  getSetupIntegrationAvailability,
} from "@/lib/integration-availability";
import { requiresKycForAutoPayout } from "@/lib/kyc";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import InviteGenerator from "./InviteGenerator";
import KycStatus from "./KycStatus";
import LinkedAccounts from "./LinkedAccounts";
import NotificationPreferences from "./NotificationPreferences";
import SettingsForm from "./SettingsForm";

export const metadata: Metadata = buildSocialMetadata("/dashboard/settings");

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="HR Settings"
        subtitle="Manage your personal information and payment preferences to receive your payouts."
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <SettingsContent />
      </Suspense>
    </PageContainer>
  );
}

async function SettingsContent() {
  const { userId } = await getSession();

  if (!userId) {
    redirect("/");
  }

  const [userProfile, linkedAccounts, latestKyc, notificationPreferences] =
    await Promise.all([
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
      prisma.notificationPreference.findMany({
        where: {
          userId,
          OR: [{ domain: "ppt_request" }, { domain: "ppt_task" }],
        },
        select: {
          domain: true,
          type: true,
          channel: true,
          enabled: true,
        },
      }),
    ]);

  if (!userProfile) {
    redirect("/dashboard");
  }

  const integrationAvailability = getSetupIntegrationAvailability();
  const robuxPayoutAvailability = getRobuxPayoutAvailability();

  return (
    <StaggerContainer>
      <Stack gap="xl">
        <StaggerItem>
          <LinkedAccounts
            linkedAccounts={linkedAccounts}
            linearEmail={userProfile.linearEmail}
            paymentMethod={userProfile.paymentMethod}
            integrationAvailability={integrationAvailability}
          />
        </StaggerItem>

        <StaggerItem>
          <SettingsForm
            profile={userProfile}
            robloxLinked={!!userProfile.robloxId}
            robuxPayoutAvailability={robuxPayoutAvailability}
          />
        </StaggerItem>

        <StaggerItem>
          <NotificationPreferences
            preferences={notificationPreferences}
            isAdmin={hasAdminAccess(userProfile)}
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
      </Stack>
    </StaggerContainer>
  );
}

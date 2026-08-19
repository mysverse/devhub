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
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import InviteGenerator from "./InviteGenerator";
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

  const [userProfile, linkedAccounts, notificationPreferences] =
    await Promise.all([
      // Explicit select, not the whole row: this object is handed straight to
      // a client component, so every column added to UserProfile would
      // otherwise start shipping to the browser on its own — including
      // admin-facing state about the developer.
      prisma.userProfile.findUnique({
        where: { id: userId },
        select: {
          preferredName: true,
          legalName: true,
          shippingAddress: true,
          linearEmail: true,
          robloxId: true,
          role: true,
          developerRank: true,
          paymentMethod: true,
          paypalEmail: true,
          duitNowId: true,
          duitNowIdType: true,
          duitNowIdStatus: true,
          duitNowIdCheckedAt: true,
          duitNowIdIssue: true,
          bankName: true,
          bankAccountNumber: true,
          bankAccountName: true,
          robuxUsername: true,
        },
      }),
      prisma.account.findMany({
        where: { userId },
        select: { providerId: true, accountId: true },
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

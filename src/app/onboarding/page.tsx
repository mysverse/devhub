import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import PageSkeleton from "@/components/PageSkeleton";
import { getSession } from "@/lib/auth-utils";
import { getDocumentTemplate, REQUIRED_DOCUMENTS } from "@/lib/documents";
import {
  getRobuxPayoutAvailability,
  getSetupIntegrationAvailability,
} from "@/lib/integration-availability";
import { getResolvedPayoutPolicy } from "@/lib/payout-policy-server";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import OnboardingFlow from "./OnboardingFlow";

export const metadata: Metadata = buildSocialMetadata("/onboarding");

export default function OnboardingPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OnboardingContent />
    </Suspense>
  );
}

async function OnboardingContent() {
  const { userId, user } = await getSession();
  if (!userId) redirect("/sign-in");

  // If a profile already exists, the user has already onboarded
  const existingProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (existingProfile) redirect("/dashboard");

  // Get linked account data from better-auth's account table
  const [linearAccount, discordAccount, robloxAccount] = await Promise.all([
    prisma.account.findFirst({
      where: { userId, providerId: "linear" },
      select: { accountId: true },
    }),
    prisma.account.findFirst({
      where: { userId, providerId: "discord" },
      select: { accountId: true },
    }),
    prisma.account.findFirst({
      where: { userId, providerId: "roblox" },
      select: { accountId: true },
    }),
  ]);

  const initialName = user?.name ?? null;
  const detectedLinearId = linearAccount?.accountId ?? null;
  const detectedLinearEmail = user?.email ?? null;
  const detectedDiscordId = discordAccount?.accountId ?? null;
  const detectedRobloxId = robloxAccount?.accountId ?? null;

  // Load document templates for the agreements step
  const documentTemplates = REQUIRED_DOCUMENTS.map((type) => {
    const template = getDocumentTemplate(type);
    return {
      type,
      title: template.meta.title,
      content: template.content,
    };
  });

  return (
    <OnboardingFlow
      initialName={initialName}
      detectedLinearId={detectedLinearId}
      detectedLinearEmail={detectedLinearEmail}
      detectedDiscordId={detectedDiscordId}
      detectedRobloxId={detectedRobloxId}
      documentTemplates={documentTemplates}
      integrationAvailability={getSetupIntegrationAvailability()}
      robuxPayoutAvailability={getRobuxPayoutAvailability()}
      policy={getResolvedPayoutPolicy()}
    />
  );
}

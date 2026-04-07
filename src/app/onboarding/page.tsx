import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-utils";
import { getDocumentTemplate, REQUIRED_DOCUMENTS } from "@/lib/documents";
import prisma from "@/lib/prisma";
import OnboardingFlow from "./OnboardingFlow";

export default async function OnboardingPage() {
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
    />
  );
}

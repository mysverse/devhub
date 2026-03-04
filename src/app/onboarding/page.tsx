import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getDocumentTemplate, REQUIRED_DOCUMENTS } from "@/lib/documents";
import { getLinearClient } from "@/lib/linear";
import prisma from "@/lib/prisma";
import OnboardingFlow from "./OnboardingFlow";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-up");

  // If a profile already exists, the user has already onboarded
  const existingProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (existingProfile) redirect("/dashboard");

  const user = await currentUser();

  const initialName = user?.firstName
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : null;

  // Attempt to auto-detect Linear account before showing the wizard
  let detectedLinearId: string | null = null;
  let detectedLinearEmail: string | null = null;

  if (user) {
    // Strategy 1: Clerk OAuth connection
    const linearOAuth = user.externalAccounts.find(
      (acc) => acc.provider === "linear",
    );
    if (linearOAuth?.providerUserId) {
      detectedLinearId = linearOAuth.providerUserId;
      detectedLinearEmail = linearOAuth.emailAddress ?? null;
    }

    // Strategy 2: Match by primary email against Linear workspace
    if (!detectedLinearId) {
      const primaryEmail = user.emailAddresses.find(
        (e) => e.id === user.primaryEmailAddressId,
      )?.emailAddress;

      if (primaryEmail) {
        try {
          const linearClient = await getLinearClient(userId);
          const usersResponse = await linearClient.users();
          const match = usersResponse.nodes.find(
            (u) => u.email.toLowerCase() === primaryEmail.toLowerCase(),
          );
          if (match) {
            detectedLinearId = match.id;
            detectedLinearEmail = match.email;
          }
        } catch {
          // Linear detection failed; user can enter their email manually
        }
      }
    }
  }

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
      documentTemplates={documentTemplates}
    />
  );
}

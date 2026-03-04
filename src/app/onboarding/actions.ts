"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { siteConfig } from "@/lib/config";
import { getDocumentTemplate, renderTemplate } from "@/lib/documents";
import { getLinearClient } from "@/lib/linear";
import prisma from "@/lib/prisma";

type OnboardingInput = {
  legalName: string;
  linearId: string | null;
  linearEmail: string | null;
  discordId: string | null;
  robuxUsername: string | null;
  paymentMethod: "PAYPAL" | "ROBUX" | "DUITNOW" | "BANK_TRANSFER";
  paypalEmail: string | null;
  duitNowId: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  agreedDocuments: string[];
};

const OnboardingSchema = z.object({
  legalName: z.string().min(1, "Legal name is required"),
  linearId: z.string().optional().nullable(),
  linearEmail: z.string().email().or(z.literal("")).optional().nullable(),
  discordId: z.string().optional().nullable(),
  robuxUsername: z.string().optional().nullable(),
  paymentMethod: z.enum(["PAYPAL", "DUITNOW", "ROBUX", "BANK_TRANSFER"]),
  paypalEmail: z
    .string()
    .email("Invalid PayPal email")
    .or(z.literal(""))
    .optional()
    .nullable(),
  duitNowId: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccountNumber: z.string().optional().nullable(),
  bankAccountName: z.string().optional().nullable(),
  agreedDocuments: z.array(z.enum(["COI", "NDA"])),
});

export async function completeOnboarding(
  input: OnboardingInput,
): Promise<{ error?: string; success?: boolean }> {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized" };

  const parsed = OnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid input data" };
  }

  const data = parsed.data;

  // If a linearEmail was provided but no linearId, try to look up the ID
  let resolvedLinearId = data.linearId ?? null;
  const resolvedLinearEmail = data.linearEmail || null;

  if (!resolvedLinearId && resolvedLinearEmail) {
    try {
      const linearClient = await getLinearClient(userId);
      const usersResponse = await linearClient.users();
      const match = usersResponse.nodes.find(
        (u) => u.email.toLowerCase() === resolvedLinearEmail.toLowerCase(),
      );
      if (match) resolvedLinearId = match.id;
    } catch {
      // Linear lookup failed; continue without resolving the ID
    }
  }

  try {
    const profileData = {
      legalName: data.legalName,
      linearId: resolvedLinearId,
      linearEmail: resolvedLinearEmail,
      discordId: data.discordId || null,
      robuxUsername: data.robuxUsername || null,
      paymentMethod: data.paymentMethod,
      paypalEmail: data.paypalEmail || null,
      duitNowId: data.duitNowId || null,
      bankName: data.bankName || null,
      bankAccountNumber: data.bankAccountNumber || null,
      bankAccountName: data.bankAccountName || null,
    };

    await prisma.userProfile.upsert({
      where: { id: userId },
      create: { id: userId, ...profileData },
      update: profileData,
    });

    // Create signed document records for agreed documents
    if (data.agreedDocuments.length > 0) {
      for (const docType of data.agreedDocuments) {
        const template = getDocumentTemplate(docType);
        const renderedContent = renderTemplate(template.content, {
          LEGAL_NAME: data.legalName,
        });

        await prisma.signedDocument.upsert({
          where: {
            userId_documentType: {
              userId,
              documentType: docType,
            },
          },
          create: {
            userId,
            documentType: docType,
            templateVersion: template.meta.version,
            templateContent: renderedContent,
            legalName: data.legalName,
          },
          update: {
            templateVersion: template.meta.version,
            templateContent: renderedContent,
            legalName: data.legalName,
            signedAt: new Date(),
          },
        });
      }
    }

    return { success: true };
  } catch (error) {
    const err = error as Error;
    if (err.message.includes("Unique constraint")) {
      if (err.message.includes("discordId")) {
        return {
          error: "This Discord ID is already linked to another account.",
        };
      }
      if (
        err.message.includes("linearId") ||
        err.message.includes("linearEmail")
      ) {
        return {
          error:
            `This Linear account is already linked to another ${siteConfig.appName} account.`,
        };
      }
    }
    return { error: "Failed to save your profile. Please try again." };
  }
}

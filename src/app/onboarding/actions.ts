"use server";

import { z } from "zod";
import { syncUserAccess } from "@/lib/access-sync";
import { getSession } from "@/lib/auth-utils";
import { siteConfig } from "@/lib/config";
import { getProbationReviewDates } from "@/lib/developer-access";
import { getDocumentTemplate, renderTemplate } from "@/lib/documents";
import { DUITNOW_ID_TYPE_VALUES, type DuitNowIdType } from "@/lib/duitnow-id";
import { getRobuxPayoutAvailability } from "@/lib/integration-availability";
import { getLinearClient } from "@/lib/linear";
import { buildDuitNowWrite } from "@/lib/payment-profile";
import { paymentSuperRefine } from "@/lib/payment-validation";
import prisma from "@/lib/prisma";

type OnboardingInput = {
  preferredName: string;
  legalName: string;
  linearId: string | null;
  linearEmail: string | null;
  paymentMethod: "PAYPAL" | "ROBUX" | "DUITNOW" | "BANK_TRANSFER";
  paypalEmail: string | null;
  duitNowId: string | null;
  duitNowType: "ID" | "BANK" | null;
  duitNowIdType: DuitNowIdType | null;
  /** ISO 3166-1 alpha-2; PASSPORT only. */
  duitNowIdCountry?: string | null;
  /** BIC of the bank or e-wallet the proxy is linked at. */
  duitNowIdInstitution?: string | null;
  duitNowConfirmed: boolean | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  agreedDocuments: string[];
  coiEntries?: {
    organizationName: string;
    natureOfInvolvement: string;
    description: string;
  }[];
};

const OnboardingSchema = z
  .object({
    preferredName: z.string().min(1, "Display name is required").max(80),
    legalName: z.string().min(1, "Legal name is required"),
    linearId: z.string().optional().nullable(),
    linearEmail: z.email().or(z.literal("")).optional().nullable(),
    paymentMethod: z.enum(["PAYPAL", "DUITNOW", "ROBUX", "BANK_TRANSFER"]),
    paypalEmail: z
      .email("Invalid PayPal email")
      .or(z.literal(""))
      .optional()
      .nullable(),
    duitNowId: z.string().optional().nullable(),
    duitNowType: z.enum(["ID", "BANK"]).optional().nullable(),
    duitNowIdType: z.enum(DUITNOW_ID_TYPE_VALUES).optional().nullable(),
    duitNowIdCountry: z.string().length(2).optional().nullable(),
    duitNowIdInstitution: z.string().optional().nullable(),
    duitNowConfirmed: z.boolean().optional().nullable(),
    bankName: z.string().optional().nullable(),
    bankAccountNumber: z.string().optional().nullable(),
    bankAccountName: z.string().optional().nullable(),
    agreedDocuments: z.array(z.enum(["COI", "NDA"])),
    coiEntries: z
      .array(
        z.object({
          organizationName: z.string().min(1),
          natureOfInvolvement: z.string().min(1),
          description: z.string().min(1),
        }),
      )
      .optional(),
  })
  .superRefine(paymentSuperRefine);

export async function completeOnboarding(
  input: OnboardingInput,
): Promise<{ error?: string; success?: boolean }> {
  const { userId } = await getSession();
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
    // Get OAuth-linked Discord and Roblox accounts
    const [discordAccount, robloxAccount] = await Promise.all([
      prisma.account.findFirst({
        where: { userId, providerId: "discord" },
        select: { accountId: true },
      }),
      prisma.account.findFirst({
        where: { userId, providerId: "roblox" },
        select: { accountId: true },
      }),
    ]);

    if (data.paymentMethod === "ROBUX") {
      const robuxPayoutAvailability = getRobuxPayoutAvailability();
      if (!robuxPayoutAvailability.configured) {
        return {
          error:
            robuxPayoutAvailability.unavailableDescription ??
            "Robux payments are unavailable right now.",
        };
      }

      if (!robloxAccount) {
        return {
          error:
            "Please link your Roblox account before selecting Robux payments.",
        };
      }
    }

    const current = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: {
        duitNowId: true,
        duitNowIdType: true,
        duitNowIdCountry: true,
        duitNowIdInstitution: true,
      },
    });

    const profileData = {
      preferredName: data.preferredName,
      legalName: data.legalName,
      linearId: resolvedLinearId,
      linearEmail: resolvedLinearEmail,
      discordId: discordAccount?.accountId ?? null,
      robloxId: robloxAccount?.accountId ?? null,
      paymentMethod: data.paymentMethod,
      paypalEmail: data.paypalEmail || null,
      ...buildDuitNowWrite(
        {
          duitNowId: data.duitNowId,
          duitNowIdType: data.duitNowIdType,
          duitNowIdCountry: data.duitNowIdCountry,
          duitNowIdInstitution: data.duitNowIdInstitution,
          confirmed: data.duitNowConfirmed ?? false,
        },
        current,
      ),
      bankName: data.bankName || null,
      bankAccountNumber: data.bankAccountNumber || null,
      bankAccountName: data.bankAccountName || null,
    };

    await prisma.userProfile.upsert({
      where: { id: userId },
      create: {
        id: userId,
        ...profileData,
        ...getProbationReviewDates(),
      },
      update: profileData,
    });

    try {
      await syncUserAccess(userId, null);
    } catch (syncError) {
      console.error("[access-sync] onboarding sync failed:", syncError);
    }

    // Create signed document records for agreed documents
    if (data.agreedDocuments.length > 0) {
      for (const docType of data.agreedDocuments) {
        const template = getDocumentTemplate(docType);
        const renderedContent = renderTemplate(template.content, {
          LEGAL_NAME: data.legalName,
        });

        const doc = await prisma.signedDocument.upsert({
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

        if (docType === "COI" && data.coiEntries?.length) {
          await prisma.coiEntry.createMany({
            data: data.coiEntries.map((entry) => ({
              signedDocumentId: doc.id,
              organizationName: entry.organizationName,
              natureOfInvolvement: entry.natureOfInvolvement,
              description: entry.description,
            })),
          });
        }
      }
    }

    return { success: true };
  } catch (error) {
    const err = error as Error;
    if (err.message.includes("Unique constraint")) {
      if (
        err.message.includes("linearId") ||
        err.message.includes("linearEmail")
      ) {
        return {
          error: `This Linear account is already linked to another ${siteConfig.appName} account.`,
        };
      }
    }
    return { error: "Failed to save your profile. Please try again." };
  }
}

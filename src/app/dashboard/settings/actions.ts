"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth-utils";
import { DUITNOW_ID_TYPE_VALUES } from "@/lib/duitnow-id";
import { getRobuxPayoutAvailability } from "@/lib/integration-availability";
import { configurablePreferenceKeys } from "@/lib/notifications/catalog";
import { buildDuitNowWrite } from "@/lib/payment-profile";
import { paymentSuperRefine } from "@/lib/payment-validation";
import prisma from "@/lib/prisma";

// Derived from the catalog, never restated here: the settings UI renders a
// toggle for every configurable entry, so anything this set doesn't cover is a
// switch that moves and then silently fails to save.
const NOTIFICATION_PREFERENCE_KEYS = configurablePreferenceKeys();

const SettingsSchema = z
  .object({
    preferredName: z.string().max(80).optional().nullable(),
    legalName: z.string().optional().nullable(),
    paymentMethod: z.enum(["PAYPAL", "DUITNOW", "ROBUX", "BANK_TRANSFER"]),
    paypalEmail: z
      .email("Invalid PayPal email")
      .or(z.literal(""))
      .optional()
      .nullable(),
    duitNowId: z.string().optional().nullable(),
    duitNowType: z.enum(["ID", "BANK"]).optional().nullable(),
    duitNowIdType: z.enum(DUITNOW_ID_TYPE_VALUES).optional().nullable(),
    duitNowConfirmed: z.boolean().optional().nullable(),
    shippingAddress: z.string().optional().nullable(),
    bankName: z.string().optional().nullable(),
    bankAccountNumber: z.string().optional().nullable(),
    bankAccountName: z.string().optional().nullable(),
  })
  .superRefine(paymentSuperRefine);

export async function updateProfileSettings(formData: FormData) {
  const { userId } = await getSession();
  if (!userId) throw new Error("Unauthorized");

  const rawData = {
    preferredName: formData.get("preferredName") || null,
    legalName: formData.get("legalName") || null,
    paymentMethod: formData.get("paymentMethod"),
    paypalEmail: formData.get("paypalEmail") || null,
    duitNowId: formData.get("duitNowId") || null,
    duitNowType: formData.get("duitNowType") || null,
    duitNowIdType: formData.get("duitNowIdType") || null,
    duitNowConfirmed: formData.get("duitNowConfirmed") === "true",
    shippingAddress: formData.get("shippingAddress") || null,
    bankName: formData.get("bankName") || null,
    bankAccountNumber: formData.get("bankAccountNumber") || null,
    bankAccountName: formData.get("bankAccountName") || null,
  };

  const parsed = SettingsSchema.safeParse(rawData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid input data" };
  }

  const {
    preferredName,
    legalName,
    paymentMethod,
    paypalEmail,
    duitNowId,
    // duitNowType picks the form branch and is not stored; duitNowIdType is.
    duitNowIdType,
    duitNowConfirmed,
    shippingAddress,
    bankName,
    bankAccountNumber,
    bankAccountName,
  } = parsed.data;

  try {
    // Verify Roblox account is linked via OAuth when payment method is ROBUX
    if (paymentMethod === "ROBUX") {
      const robuxPayoutAvailability = getRobuxPayoutAvailability();
      if (!robuxPayoutAvailability.configured) {
        return {
          error:
            robuxPayoutAvailability.unavailableDescription ??
            "Robux payments are unavailable right now.",
        };
      }

      const robloxAccount = await prisma.account.findFirst({
        where: { userId, providerId: "roblox" },
        select: { accountId: true },
      });
      if (!robloxAccount) {
        return {
          error:
            "Please link your Roblox account before selecting Robux as payment method.",
        };
      }
    }

    // Read the stored identifier first: buildDuitNowWrite only resets a
    // recorded bank lookup when the value it was about actually changed, so
    // saving an unrelated field leaves it intact.
    const current = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { duitNowId: true, duitNowIdType: true },
    });

    await prisma.userProfile.update({
      where: { id: userId },
      data: {
        preferredName: preferredName?.trim() || null,
        legalName: legalName || null,
        paymentMethod,
        paypalEmail: paypalEmail || null,
        ...buildDuitNowWrite(
          {
            duitNowId,
            duitNowIdType,
            confirmed: duitNowConfirmed ?? false,
          },
          current,
        ),
        shippingAddress: shippingAddress || null,
        bankName: bankName || null,
        bankAccountNumber: bankAccountNumber || null,
        bankAccountName: bankAccountName || null,
      },
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to update profile" };
  }
}

export async function updateNotificationPreference(input: {
  domain: string;
  type: string;
  channel: string;
  enabled: boolean;
}) {
  const { userId } = await getSession();
  if (!userId) throw new Error("Unauthorized");

  const key = `${input.domain}:${input.type}:${input.channel}`;
  if (!NOTIFICATION_PREFERENCE_KEYS.has(key)) {
    return { error: "Unknown notification preference" };
  }

  await prisma.notificationPreference.upsert({
    where: {
      userId_domain_type_channel: {
        userId,
        domain: input.domain,
        type: input.type,
        channel: input.channel,
      },
    },
    update: { enabled: input.enabled },
    create: {
      userId,
      domain: input.domain,
      type: input.type,
      channel: input.channel,
      enabled: input.enabled,
    },
  });

  revalidatePath("/dashboard/settings");
  return { success: true };
}

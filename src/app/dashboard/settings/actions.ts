"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth-utils";
import { isKycApproved, requiresKycForAutoPayout } from "@/lib/kyc";
import {
  normalizeMalaysianPhone,
  paymentSuperRefine,
} from "@/lib/payment-validation";
import prisma from "@/lib/prisma";

const SettingsSchema = z
  .object({
    legalName: z.string().optional().nullable(),
    paymentMethod: z.enum(["PAYPAL", "DUITNOW", "ROBUX", "BANK_TRANSFER"]),
    paypalEmail: z
      .email("Invalid PayPal email")
      .or(z.literal(""))
      .optional()
      .nullable(),
    duitNowId: z.string().optional().nullable(),
    duitNowType: z.enum(["ID", "BANK"]).optional().nullable(),
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
    legalName: formData.get("legalName") || null,
    paymentMethod: formData.get("paymentMethod"),
    paypalEmail: formData.get("paypalEmail") || null,
    duitNowId: formData.get("duitNowId") || null,
    duitNowType: formData.get("duitNowType") || null,
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
    legalName,
    paymentMethod,
    paypalEmail,
    duitNowId,
    // duitNowType is validation-only, not stored in DB
    shippingAddress,
    bankName,
    bankAccountNumber,
    bankAccountName,
  } = parsed.data;

  try {
    // Verify Roblox account is linked via OAuth when payment method is ROBUX
    if (paymentMethod === "ROBUX") {
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

    await prisma.userProfile.update({
      where: { id: userId },
      data: {
        legalName: legalName || null,
        paymentMethod,
        paypalEmail: paypalEmail || null,
        duitNowId: duitNowId ? normalizeMalaysianPhone(duitNowId) : null,
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

export async function updateAutoPayoutSetting(enabled: boolean) {
  const { userId } = await getSession();
  if (!userId) throw new Error("Unauthorized");

  if (enabled) {
    // Verify user's payment method requires KYC and KYC is approved
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { bankName: true },
    });

    if (!profile || !requiresKycForAutoPayout(profile.bankName)) {
      return {
        error:
          "Automatic payouts are not available for your current payment method.",
      };
    }

    const approved = await isKycApproved(userId);
    if (!approved) {
      return {
        error:
          "Identity verification must be completed before enabling automatic payouts.",
      };
    }
  }

  await prisma.userProfile.update({
    where: { id: userId },
    data: { autoPayoutEnabled: enabled },
  });

  revalidatePath("/dashboard/settings");
  return { success: true };
}

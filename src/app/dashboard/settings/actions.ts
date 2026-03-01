'use server'

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const SettingsSchema = z.object({
  legalName: z.string().optional().nullable(),
  paymentMethod: z.enum(['PAYPAL', 'DUITNOW', 'ROBUX', 'BANK_TRANSFER']),
  paypalEmail: z.string().email("Invalid PayPal email").or(z.literal('')).optional().nullable(),
  duitNowId: z.string().optional().nullable(),
  robuxUsername: z.string().optional().nullable(),
  shippingAddress: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccountNumber: z.string().optional().nullable(),
  bankAccountName: z.string().optional().nullable()
});

export async function updateProfileSettings(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const rawData = {
    legalName: formData.get('legalName') || null,
    paymentMethod: formData.get('paymentMethod'),
    paypalEmail: formData.get('paypalEmail') || null,
    duitNowId: formData.get('duitNowId') || null,
    robuxUsername: formData.get('robuxUsername') || null,
    shippingAddress: formData.get('shippingAddress') || null,
    bankName: formData.get('bankName') || null,
    bankAccountNumber: formData.get('bankAccountNumber') || null,
    bankAccountName: formData.get('bankAccountName') || null,
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
    robuxUsername,
    shippingAddress,
    bankName,
    bankAccountNumber,
    bankAccountName
  } = parsed.data;

  try {
    await prisma.userProfile.update({
      where: { id: userId },
      data: {
        legalName: legalName || null,
        paymentMethod,
        paypalEmail: paypalEmail || null,
        duitNowId: duitNowId || null,
        robuxUsername: robuxUsername || null,
        shippingAddress: shippingAddress || null,
        bankName: bankName || null,
        bankAccountNumber: bankAccountNumber || null,
        bankAccountName: bankAccountName || null,
      }
    });

    revalidatePath('/dashboard/settings');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to update profile" };
  }
}


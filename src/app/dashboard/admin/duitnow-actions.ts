"use server";

/**
 * Recording what the bank said about a DuitNow proxy ID.
 *
 * There is no public proxy-resolution API for a non-bank. PayNet documents
 * one, but access is scheme-participant onboarding, and since 2021 PayNet
 * masks recipient names after five consecutive enquiries that are not followed
 * by a transaction — precisely to stop the "look up an ID to see who owns it"
 * pattern. Billplz has no name-enquiry endpoint and disburses to bank accounts
 * only; Xendit's account-validation product does not cover Malaysia.
 *
 * So DevHub cannot verify an ID before paying. What it can do is stop throwing
 * away the answer an admin already gets: every manual payout involves typing
 * the proxy into the bank and seeing whether a name comes back. These two
 * actions record that, which is the only ground truth available.
 */

import { revalidatePath } from "next/cache";
import PaymentInfoInvalid from "@/emails/PaymentInfoInvalid";
import { requireAdmin } from "@/lib/authz";
import { duitNowIssueMessage } from "@/lib/duitnow-copy";
import { EMAIL_CHANNEL, IN_APP_CHANNEL, notify } from "@/lib/notifications";
import { getBankDisplayName } from "@/lib/payment-validation";
import prisma from "@/lib/prisma";
import { getUserEmailAndName } from "@/lib/user-contact";

export async function confirmDuitNowIdResolved(userId: string) {
  await requireAdmin();

  try {
    await prisma.userProfile.update({
      where: { id: userId },
      data: {
        duitNowIdStatus: "RESOLVED",
        duitNowIdCheckedAt: new Date(),
        duitNowIdIssue: null,
      },
    });

    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to record the lookup" };
  }
}

export async function markDuitNowIdUnreachable(
  userId: string,
  issue: "NOT_FOUND" | "NAME_MISMATCH" | "WRONG_TYPE" | "REGISTERED_ELSEWHERE",
) {
  const adminId = await requireAdmin();

  try {
    const profile = await prisma.userProfile.update({
      where: { id: userId },
      data: {
        duitNowIdStatus: "UNREACHABLE",
        duitNowIdCheckedAt: new Date(),
        duitNowIdIssue: issue,
      },
      select: { duitNowIdCheckedAt: true, duitNowIdInstitution: true },
    });

    const { email, name } = await getUserEmailAndName(userId);
    // Name the app the developer said it was linked at: that is where the
    // fix is, and "your banking or e-wallet app" sends them everywhere.
    const reason = duitNowIssueMessage(issue, {
      institutionName: getBankDisplayName(profile.duitNowIdInstitution),
    });
    // Keyed on the check, not on the day: a second lookup after the developer
    // says they fixed it has to be able to tell them it still does not work.
    const key = `payment:duitnow-unreachable:${userId}:${profile.duitNowIdCheckedAt?.toISOString()}`;

    await notify({
      userId,
      actorId: adminId,
      domain: "payment",
      type: "DETAILS_UNREACHABLE",
      title: "We could not find your DuitNow ID",
      message: reason,
      href: "/dashboard/settings",
      entityType: "user_profile",
      entityId: userId,
      dedupeKey: key,
      channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
      email: {
        to: email,
        subject: "Action needed: we could not find your DuitNow ID",
        category: "payment_details_unreachable",
        idempotencyKey: key,
        react: PaymentInfoInvalid({ userName: name, reason }),
      },
    });

    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to record the lookup" };
  }
}

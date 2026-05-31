"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { evaluatePptIssueById } from "@/lib/ppt-eligibility";
import prisma from "@/lib/prisma";

function isProviderPayoutActiveOrCompleted(
  payout: { status: string } | null | undefined,
) {
  return Boolean(
    payout && ["PENDING", "PROCESSING", "COMPLETED"].includes(payout.status),
  );
}

export async function retryPptEligibilityAsAdmin(issueId: string) {
  const adminId = await requireAdmin();

  try {
    await evaluatePptIssueById(issueId, {
      userId: adminId,
      trigger: "admin_retry",
    });
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to retry PPT eligibility" };
  }
}

export async function overridePptProofAsAdmin(
  linearIssueId: string,
  note: string,
) {
  const adminId = await requireAdmin();
  const trimmedNote = note.trim();

  if (!trimmedNote) {
    return { error: "Add a justification before overriding proof." };
  }

  const state = await prisma.pptPayoutState.findUnique({
    where: { linearIssueId },
    include: { transaction: { include: { payout: true } } },
  });
  if (!state) {
    return { error: "PPT eligibility state was not found." };
  }

  const transaction =
    state.transaction ??
    (await prisma.transaction.findUnique({
      where: { linearIssueId },
      include: { payout: true },
    }));

  if (
    transaction?.status === "PAID" ||
    isProviderPayoutActiveOrCompleted(transaction?.payout)
  ) {
    return { error: "This PPT has already been paid out." };
  }

  try {
    await prisma.pptPayoutState.update({
      where: { id: state.id },
      data: {
        proofOverride: true,
        proofOverrideById: adminId,
        proofOverrideAt: new Date(),
        proofOverrideNote: trimmedNote.slice(0, 1000),
        proofOverrideEpisode: state.completionEpisode,
      },
    });
    await prisma.pptPayoutEvent.create({
      data: {
        stateId: state.id,
        linearIssueId,
        type: "PROOF_OVERRIDDEN",
        reason: "READY_FOR_PAYOUT",
        message: trimmedNote.slice(0, 1000),
        metadata: { adminUserId: adminId },
      },
    });
    await evaluatePptIssueById(linearIssueId, {
      userId: adminId,
      trigger: "admin_override",
    });
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to override PPT proof" };
  }
}

export async function clearPptProofOverrideAsAdmin(linearIssueId: string) {
  const adminId = await requireAdmin();
  const state = await prisma.pptPayoutState.findUnique({
    where: { linearIssueId },
  });
  if (!state) {
    return { error: "PPT eligibility state was not found." };
  }

  try {
    await prisma.pptPayoutState.update({
      where: { id: state.id },
      data: {
        proofOverride: false,
        proofOverrideById: null,
        proofOverrideAt: null,
        proofOverrideNote: null,
        proofOverrideEpisode: null,
      },
    });
    await prisma.pptPayoutEvent.create({
      data: {
        stateId: state.id,
        linearIssueId,
        type: "PROOF_RESET",
        reason: "MISSING_PROOF",
        message: "Admin cleared proof override",
        metadata: { adminUserId: adminId },
      },
    });
    await evaluatePptIssueById(linearIssueId, {
      userId: adminId,
      trigger: "admin_retry",
    });
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to clear PPT proof override" };
  }
}

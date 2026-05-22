"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { evaluatePptIssueById } from "@/lib/ppt-eligibility";

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

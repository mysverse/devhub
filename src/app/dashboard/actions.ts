"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getSession } from "@/lib/auth-utils";
import { TAGS } from "@/lib/cache-tags";
import { getLinearClient, LinearReauthRequiredError } from "@/lib/linear";

export async function claimIssue(issueId: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  try {
    const linearClient = await getLinearClient(userId);
    const viewer = await linearClient.viewer;

    await linearClient.updateIssue(issueId, {
      assigneeId: viewer.id,
    });

    revalidatePath("/dashboard/ppts");
    revalidatePath("/dashboard");
    updateTag(TAGS.workspacePpts);
    updateTag(TAGS.userIssues(viewer.id));

    return { success: true };
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    const err = e as Error;
    console.error("Failed to claim issue:", err);
    return { error: err.message || "Failed to claim task" };
  }
}

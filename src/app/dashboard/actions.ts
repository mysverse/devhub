"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getLinearClient } from "@/lib/linear";

export async function claimIssue(issueId: string) {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized" };

  try {
    const linearClient = await getLinearClient(userId);
    const viewer = await linearClient.viewer;

    await linearClient.updateIssue(issueId, {
      assigneeId: viewer.id,
    });

    revalidatePath("/dashboard/ppts");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (e) {
    const err = e as Error;
    console.error("Failed to claim issue:", err);
    return { error: err.message || "Failed to claim task" };
  }
}

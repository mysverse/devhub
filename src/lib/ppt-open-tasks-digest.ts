import { createElement } from "react";
import PptOpenTasksDigest from "@/emails/PptOpenTasksDigest";
import { formatEstimate, getCurrencyForPaymentMethod } from "@/lib/currency";
import { resolveDisplayName } from "@/lib/display-name";
import { getLinearServiceClient } from "@/lib/linear";
import { fetchSuggestedPpts } from "@/lib/linear-queries";
import { EMAIL_CHANNEL, notifyWithPreferences } from "@/lib/notifications";
import prisma from "@/lib/prisma";
import { USER_IDENTITY_SELECT } from "@/lib/prisma-select";

const ACTIVITY_WINDOW_DAYS = 60;
const DIGEST_TASK_COUNT = 5;

/**
 * Weekly re-engagement digest: developers with ZERO active claimed tasks (and
 * some DevHub activity in the last 60 days) get an email with the top open
 * PPTs. Email-only, opt-out-able via notification preferences, and never sent
 * to anyone already carrying work — this encourages claiming without ever
 * nagging busy people.
 */
export async function runPptOpenTasksDigest() {
  const client = getLinearServiceClient();
  if (!client) {
    throw new Error(
      "LINEAR_SERVICE_API_KEY is required for the open-tasks digest",
    );
  }

  const openTasks = (await fetchSuggestedPpts(client)).filter(
    (issue) => !issue.assignee,
  );
  if (openTasks.length === 0) {
    return { sent: 0, skipped: "no open tasks" };
  }

  const activityCutoff = new Date(
    Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const developers = await prisma.userProfile.findMany({
    where: {
      role: "DEVELOPER",
      linearId: { not: null },
      OR: [
        {
          pptAssignmentWatches: {
            some: { updatedAt: { gte: activityCutoff } },
          },
        },
        { transactions: { some: { createdAt: { gte: activityCutoff } } } },
      ],
      pptAssignmentWatches: {
        none: { status: { in: ["ACTIVE", "WARNED", "SNOOZED", "BLOCKED"] } },
      },
    },
    include: { user: { select: USER_IDENTITY_SELECT } },
  });

  const weekKey = new Date().toISOString().slice(0, 10);
  let sent = 0;
  for (const developer of developers) {
    if (!developer.user.email) continue;
    const currency = getCurrencyForPaymentMethod(developer.paymentMethod);
    const tasks = openTasks.slice(0, DIGEST_TASK_COUNT).map((issue) => ({
      identifier: issue.identifier,
      title: issue.title,
      payoutLabel: formatEstimate(issue.estimate, currency),
    }));

    const result = await notifyWithPreferences({
      userId: developer.id,
      domain: "ppt_task",
      type: "OPEN_TASKS_DIGEST",
      title: `${openTasks.length} open PPT${openTasks.length === 1 ? "" : "s"} worth a look`,
      message:
        "You have no active tasks right now — here are the top open PPTs on the board.",
      href: "/dashboard/ppts",
      dedupeKey: `ppt-task:open-digest:${developer.id}:${weekKey}`,
      channels: [EMAIL_CHANNEL],
      email: {
        to: developer.user.email,
        subject: `Open PPTs this week — ${openTasks.length} available`,
        category: "ppt_open_tasks_digest",
        idempotencyKey: `ppt-task:open-digest:${developer.id}:${weekKey}`,
        react: createElement(PptOpenTasksDigest, {
          userName: resolveDisplayName({
            profile: developer,
            fallback: "developer",
          }),
          tasks,
          totalCount: openTasks.length,
        }),
      },
    });
    if (result) sent++;
  }

  return { sent, eligible: developers.length, openTasks: openTasks.length };
}

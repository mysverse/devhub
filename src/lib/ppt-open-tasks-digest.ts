import { createElement } from "react";
import FirstTaskInvite from "@/emails/FirstTaskInvite";
import PptOpenTasksDigest from "@/emails/PptOpenTasksDigest";
import { formatEstimate, getCurrencyForPaymentMethod } from "@/lib/currency";
import { classifyDigestCohort } from "@/lib/digest-cohort";
import { resolveDisplayName } from "@/lib/display-name";
import { getLinearServiceClient } from "@/lib/linear";
import { fetchSuggestedPpts } from "@/lib/linear-queries";
import { EMAIL_CHANNEL, notifyWithPreferences } from "@/lib/notifications";
import prisma from "@/lib/prisma";
import { USER_IDENTITY_SELECT } from "@/lib/prisma-select";
import { rankPptsForUser } from "@/lib/task-recommendation-server";

const ACTIVITY_WINDOW_DAYS = 60;
const DIGEST_TASK_COUNT = 5;
/** A never-activated developer gets a shorter, less intimidating list. */
const FIRST_TASK_COUNT = 3;
/**
 * Grace period before a brand-new developer is nudged. Long enough that
 * someone still working through onboarding isn't chased; short enough that a
 * developer who quietly stalled is reached in their first fortnight.
 */
const ONBOARDING_GRACE_DAYS = 7;

/**
 * Weekly re-engagement digest for developers carrying no active claimed task.
 *
 * The audience used to require prior activity: a developer had to already
 * have an assignment watch or a transaction to qualify. That excluded, by
 * construction, the exact people this email exists to reach — onboarded but
 * never claimed anything. DevHub's only re-engagement channel could not fire
 * for the population with the worst activation.
 *
 * Now everyone with no active task is in scope, split by cohort (see
 * digest-cohort.ts) so the message is honest about where they actually are.
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

  const now = Date.now();
  const activityCutoff = new Date(
    now - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const onboardingCutoff = new Date(
    now - ONBOARDING_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );

  const developers = await prisma.userProfile.findMany({
    where: {
      role: "DEVELOPER",
      // The only hard exclusion: never nag someone already carrying work.
      pptAssignmentWatches: {
        none: { status: { in: ["ACTIVE", "WARNED", "SNOOZED", "BLOCKED"] } },
      },
    },
    include: {
      user: { select: { ...USER_IDENTITY_SELECT, createdAt: true } },
      pptAssignmentWatches: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { updatedAt: true },
      },
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const weekKey = new Date(now).toISOString().slice(0, 10);
  let sent = 0;
  let eligible = 0;

  for (const developer of developers) {
    if (!developer.user.email) continue;

    const cohort = classifyDigestCohort(
      {
        hasLinearId: Boolean(developer.linearId),
        accountCreatedAt: developer.user.createdAt,
        lastWatchAt: developer.pptAssignmentWatches[0]?.updatedAt ?? null,
        lastTransactionAt: developer.transactions[0]?.createdAt ?? null,
      },
      { activityCutoff, onboardingCutoff },
    );
    // null = still inside the onboarding grace period.
    if (!cohort) continue;

    eligible++;
    const currency = getCurrencyForPaymentMethod(developer.paymentMethod);
    const userName = resolveDisplayName({
      profile: developer,
      fallback: "developer",
    });
    // Cohort is part of the dedupe key: a developer who crosses from
    // "never activated" to "lapsed" should still hear from us that week
    // rather than being swallowed by the previous cohort's send.
    const dedupeKey = `ppt-task:open-digest:${developer.id}:${cohort}:${weekKey}`;

    const ranked =
      cohort === "unlinked"
        ? []
        : await rankPptsForUser(developer.id, openTasks);
    const isFirstTask = cohort === "never-activated";
    const tasks = ranked
      .slice(0, isFirstTask ? FIRST_TASK_COUNT : DIGEST_TASK_COUNT)
      .map(({ task, because }) => ({
        identifier: task.identifier,
        title: task.title,
        payoutLabel: formatEstimate(task.estimate, currency),
        because,
      }));

    const result = await notifyWithPreferences({
      userId: developer.id,
      domain: "ppt_task",
      type: "OPEN_TASKS_DIGEST",
      title:
        cohort === "unlinked"
          ? "Connect Linear to start claiming tasks"
          : isFirstTask
            ? "A few tasks picked out for your first one"
            : `${openTasks.length} open PPT${openTasks.length === 1 ? "" : "s"} worth a look`,
      message:
        cohort === "unlinked"
          ? "Your DevHub account is ready — linking Linear is the last step before you can claim a task."
          : isFirstTask
            ? "You haven't claimed a task yet. These are the smallest ones on the board right now."
            : "You have no active tasks right now — here are the top open PPTs on the board.",
      href: cohort === "unlinked" ? "/dashboard/settings" : "/dashboard/ppts",
      dedupeKey,
      channels: [EMAIL_CHANNEL],
      email: {
        to: developer.user.email,
        subject:
          cohort === "unlinked"
            ? "One step left before you can claim a task"
            : isFirstTask
              ? "Your first PPT — a few picked out for you"
              : `Open PPTs this week — ${openTasks.length} available`,
        category: "ppt_open_tasks_digest",
        idempotencyKey: dedupeKey,
        react:
          cohort === "unlinked" || isFirstTask
            ? createElement(FirstTaskInvite, {
                userName,
                tasks,
                needsLinearLink: cohort === "unlinked",
              })
            : createElement(PptOpenTasksDigest, {
                userName,
                tasks,
                totalCount: openTasks.length,
              }),
      },
    });
    if (result) sent++;
  }

  return { sent, eligible, openTasks: openTasks.length };
}

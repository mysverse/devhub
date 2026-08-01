import { notifyWithPreferences } from "@/lib/notifications";
import prisma from "@/lib/prisma";

// Persisted achievements. THE RULE: keys reward completion and delivery,
// never claim volume — recognizing task-grabbing would fight the fairness
// mechanics. FIRST_CLAIM is the single once-ever exception (activation, not
// volume: it can only fire once per developer, so it can't reward hoarding).
//
// awardAchievement is idempotent (unique userId+key) and non-throwing — it
// runs inside payout/webhook paths that must never fail because of a
// celebration.

export type AchievementKey =
  | "FIRST_CLAIM"
  | "FIRST_PROOF"
  | "FIRST_PAYOUT"
  | "COMPLETIONS_10"
  | "COMPLETIONS_25"
  | "COMPLETIONS_50"
  | "STREAK_4";

export type AchievementDefinition = {
  key: AchievementKey;
  title: string;
  description: string;
  /** Emoji shown on badges and toasts — deliberately lo-fi, not gamey. */
  emoji: string;
};

export const ACHIEVEMENTS: Record<AchievementKey, AchievementDefinition> = {
  FIRST_CLAIM: {
    key: "FIRST_CLAIM",
    title: "Off the mark",
    description: "Claimed your first PPT.",
    emoji: "🙌",
  },
  FIRST_PROOF: {
    key: "FIRST_PROOF",
    title: "Show your work",
    description: "First proof accepted.",
    emoji: "🔍",
  },
  FIRST_PAYOUT: {
    key: "FIRST_PAYOUT",
    title: "First payout",
    description: "Completed the full loop: claim, proof, payment.",
    emoji: "💸",
  },
  COMPLETIONS_10: {
    key: "COMPLETIONS_10",
    title: "Ten done",
    description: "Ten qualifying tasks completed.",
    emoji: "🔟",
  },
  COMPLETIONS_25: {
    key: "COMPLETIONS_25",
    title: "Twenty-five strong",
    description: "Twenty-five qualifying tasks completed.",
    emoji: "🏗️",
  },
  COMPLETIONS_50: {
    key: "COMPLETIONS_50",
    title: "Half a hundred",
    description: "Fifty qualifying tasks completed.",
    emoji: "🏆",
  },
  STREAK_4: {
    key: "STREAK_4",
    title: "Month of momentum",
    description: "Four qualifying weeks in a row.",
    emoji: "🔥",
  },
};

export const COMPLETION_MILESTONES: {
  count: number;
  key: AchievementKey;
}[] = [
  { count: 10, key: "COMPLETIONS_10" },
  { count: 25, key: "COMPLETIONS_25" },
  { count: 50, key: "COMPLETIONS_50" },
];

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Award once; repeat calls are no-ops. Fire-and-forget safe: never throws.
 * Returns true only when the achievement was newly earned.
 */
export async function awardAchievement(
  userId: string,
  key: AchievementKey,
  meta?: Record<string, unknown>,
): Promise<boolean> {
  try {
    await prisma.developerAchievement.create({
      data: { userId, key, meta: meta as never },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    console.error("[achievements] Failed to award:", key, error);
    return false;
  }

  const definition = ACHIEVEMENTS[key];
  try {
    await notifyWithPreferences({
      userId,
      domain: "recognition",
      type: "ACHIEVEMENT",
      title: `${definition.emoji} ${definition.title}`,
      message: definition.description,
      href: "/dashboard",
      entityType: "achievement",
      entityId: key,
      payload: { key },
      dedupeKey: `recognition:${userId}:${key}`,
    });
  } catch (error) {
    console.error("[achievements] Failed to notify:", key, error);
  }
  return true;
}

/** Check completion-count milestones after a new qualifying completion. */
export async function awardCompletionMilestones(userId: string) {
  try {
    const count = await prisma.issueCompletion.count({ where: { userId } });
    for (const milestone of COMPLETION_MILESTONES) {
      if (count >= milestone.count) {
        await awardAchievement(userId, milestone.key, { count });
      }
    }
  } catch (error) {
    console.error("[achievements] Milestone check failed:", error);
  }
}

export async function markAchievementsSeen(userId: string) {
  await prisma.developerAchievement.updateMany({
    where: { userId, seenAt: null },
    data: { seenAt: new Date() },
  });
}

/**
 * The last seven days for one developer, read once and shared by the card that
 * renders it and the action that summarises it.
 *
 * Deliberately not a `"use server"` module: nothing here is a public endpoint.
 * Two copies of these queries would be two definitions of "this week", and the
 * prose would eventually describe a different week from the numbers beside it.
 */

import {
  PROOF_ACTIONABLE_REASONS,
  PROOF_ACTIONABLE_STATUSES,
} from "@/lib/ppt-reason-copy";
import prisma from "@/lib/prisma";

export const WEEK_WINDOW_DAYS = 7;

export type WeekInReviewData = {
  paid: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
  proofPostedCount: number;
  /** Tasks whose payout is blocked on the developer doing something. */
  waitingOnYou: string[];
  activeTitles: string[];
};

export async function loadWeekInReview(
  userId: string,
): Promise<WeekInReviewData> {
  const since = new Date(Date.now() - WEEK_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [paid, pending, proofPostedCount, waiting, active] = await Promise.all([
    prisma.transaction.findMany({
      // paidAt, not createdAt: a payout raised a fortnight ago and settled
      // yesterday is this week's money to the person who received it.
      where: { userId, status: "PAID", paidAt: { gte: since } },
      select: { amount: true, currency: true },
    }),
    prisma.transaction.findMany({
      where: { userId, status: { in: ["PENDING", "ON_HOLD"] } },
      select: { amount: true, currency: true },
    }),
    prisma.pptPayoutState.count({
      where: { userId, proofProvidedAt: { gte: since } },
    }),
    prisma.pptPayoutState.findMany({
      // The shared definition of "waiting on the developer for proof", not a
      // local copy: this list previously omitted ON_HOLD and
      // PROOF_RESET_BY_QUESTION, so a task held after a reviewer's follow-up
      // question counted as nothing outstanding while the same dashboard was
      // telling the developer to post proof for it.
      where: {
        userId,
        status: { in: [...PROOF_ACTIONABLE_STATUSES] },
        reason: { in: [...PROOF_ACTIONABLE_REASONS] },
      },
      select: { linearIssueTitle: true },
      take: 10,
    }),
    prisma.pptPayoutState.findMany({
      where: { userId, status: { notIn: ["PAID"] } },
      select: { linearIssueTitle: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  const titles = (rows: { linearIssueTitle: string | null }[]) =>
    rows
      .map((row) => row.linearIssueTitle?.trim())
      .filter((title): title is string => Boolean(title));

  return {
    paid,
    pending,
    proofPostedCount,
    waitingOnYou: titles(waiting),
    activeTitles: titles(active),
  };
}

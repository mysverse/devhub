import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import { formatAwardType, recordUserActivityDay } from "@/lib/incentives";
import prisma from "@/lib/prisma";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [pptNotifications, bonusNotifications, incentiveNotifications] =
    await Promise.all([
      prisma.pptNotification.findMany({
        where: { userId, readAt: null },
        include: {
          state: {
            select: {
              linearIssueIdentifier: true,
              linearIssueTitle: true,
              linearIssueUrl: true,
              status: true,
              reason: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 10,
      }),
      prisma.bonusNotification.findMany({
        where: { userId, readAt: null },
        include: {
          candidate: {
            select: {
              id: true,
              linearIssueIdentifier: true,
              linearIssueTitle: true,
              maxAmount: true,
              currency: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 10,
      }),
      prisma.incentiveNotification.findMany({
        where: { userId, readAt: null },
        include: {
          award: {
            select: {
              id: true,
              type: true,
              period: true,
              amount: true,
              currency: true,
              status: true,
              releaseAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 10,
      }),
      recordUserActivityDay(userId),
    ]);

  return NextResponse.json({
    ppt: pptNotifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      identifier: notification.state.linearIssueIdentifier,
      issueTitle: notification.state.linearIssueTitle,
      issueUrl: notification.state.linearIssueUrl,
      status: notification.state.status,
      reason: notification.state.reason,
      createdAt: notification.createdAt.toISOString(),
    })),
    bonus: bonusNotifications.map((notification) => ({
      id: notification.id,
      candidateId: notification.candidateId,
      title:
        notification.candidate.linearIssueTitle ||
        notification.candidate.linearIssueIdentifier ||
        "Bonus task",
      identifier: notification.candidate.linearIssueIdentifier,
      amount: notification.candidate.maxAmount,
      currency: notification.candidate.currency,
      formattedAmount: formatAmount(
        notification.candidate.maxAmount,
        notification.candidate.currency === "ROBUX" ? "ROBUX" : "MYR",
      ),
      createdAt: notification.createdAt.toISOString(),
    })),
    incentive: incentiveNotifications.map((notification) => ({
      id: notification.id,
      awardId: notification.awardId,
      type: notification.type,
      title: formatAwardType(notification.award.type),
      period: notification.award.period,
      amount: notification.award.amount,
      currency: notification.award.currency,
      formattedAmount: formatAmount(
        notification.award.amount,
        notification.award.currency === "ROBUX"
          ? "ROBUX"
          : ("MYR" as CurrencyCode),
      ),
      status: notification.award.status,
      releaseAt: notification.award.releaseAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    ppt?: string[];
    bonus?: string[];
    incentive?: string[];
  };
  const pptIds = Array.isArray(body.ppt)
    ? body.ppt.filter((id): id is string => typeof id === "string")
    : [];
  const bonusIds = Array.isArray(body.bonus)
    ? body.bonus.filter((id): id is string => typeof id === "string")
    : [];
  const incentiveIds = Array.isArray(body.incentive)
    ? body.incentive.filter((id): id is string => typeof id === "string")
    : [];
  const readAt = new Date();

  await Promise.all([
    pptIds.length > 0
      ? prisma.pptNotification.updateMany({
          where: { userId, readAt: null, id: { in: pptIds } },
          data: { readAt },
        })
      : Promise.resolve(),
    bonusIds.length > 0
      ? prisma.bonusNotification.updateMany({
          where: { userId, readAt: null, id: { in: bonusIds } },
          data: { readAt },
        })
      : Promise.resolve(),
    incentiveIds.length > 0
      ? prisma.incentiveNotification.updateMany({
          where: { userId, readAt: null, id: { in: incentiveIds } },
          data: { readAt },
        })
      : Promise.resolve(),
  ]);

  return NextResponse.json({ success: true });
}

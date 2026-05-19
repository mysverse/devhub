import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import { formatAmount } from "@/lib/currency";
import prisma from "@/lib/prisma";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notifications = await prisma.bonusNotification.findMany({
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
  });

  return NextResponse.json({
    notifications: notifications.map((notification) => ({
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
  });
}

export async function POST(req: Request) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    ids?: string[];
  };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string")
    : [];

  await prisma.bonusNotification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ success: true });
}

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

  await recordUserActivityDay(userId);

  const notifications = await prisma.incentiveNotification.findMany({
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
  });

  return NextResponse.json({
    notifications: notifications.map((notification) => ({
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

  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string")
    : [];

  await prisma.incentiveNotification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ success: true });
}

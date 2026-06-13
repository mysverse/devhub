import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import { recordUserActivityDay } from "@/lib/incentives";
import {
  listUnreadInAppNotifications,
  markInAppNotificationsRead,
} from "@/lib/notifications";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [deliveries] = await Promise.all([
    listUnreadInAppNotifications(userId, 30),
    recordUserActivityDay(userId),
  ]);

  return NextResponse.json({
    notifications: deliveries.map((delivery) => ({
      id: delivery.id,
      notificationId: delivery.notificationId,
      domain: delivery.notification.domain,
      type: delivery.notification.type,
      title: delivery.notification.title,
      message: delivery.notification.message,
      href: delivery.notification.href,
      entityType: delivery.notification.entityType,
      entityId: delivery.notification.entityId,
      payload: delivery.notification.payload,
      createdAt: delivery.notification.createdAt.toISOString(),
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

  await markInAppNotificationsRead(userId, ids);

  return NextResponse.json({ success: true });
}

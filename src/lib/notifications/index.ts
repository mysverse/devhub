import type { Prisma } from "@prisma/client";
import type React from "react";
import { createElement } from "react";
import NotificationEmail from "@/emails/NotificationEmail";
import { sendEmail } from "@/lib/email";
import prisma from "@/lib/prisma";

export const IN_APP_CHANNEL = "in_app";
export const EMAIL_CHANNEL = "email";

export type NotificationChannel = typeof IN_APP_CHANNEL | typeof EMAIL_CHANNEL;

type EmailOptions = {
  to?: string | null;
  subject?: string;
  category?: string;
  react?: React.ReactElement;
  idempotencyKey?: string;
  dedupeWindowMs?: number | false;
  attachments?: { filename: string; content: Buffer }[];
};

export type NotifyInput = {
  userId: string;
  actorId?: string | null;
  domain: string;
  type: string;
  title: string;
  message: string;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Prisma.InputJsonValue;
  dedupeKey?: string | null;
  channels?: NotificationChannel[];
  email?: EmailOptions;
  resetReadOnDedupe?: boolean;
};

type NotificationRecord = Prisma.NotificationGetPayload<{
  include: {
    user: { include: { user: { select: { email: true; name: true } } } };
    deliveries: true;
  };
}>;

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function uniqueChannels(channels: NotificationChannel[] | undefined) {
  return [...new Set(channels?.length ? channels : [IN_APP_CHANNEL])];
}

function deliveryFor(record: NotificationRecord, channel: string) {
  return record.deliveries.find((delivery) => delivery.channel === channel);
}

async function loadNotification(
  id: string,
): Promise<NotificationRecord | null> {
  return prisma.notification.findUnique({
    where: { id },
    include: {
      user: { include: { user: { select: { email: true, name: true } } } },
      deliveries: true,
    },
  });
}

async function createNotification(input: NotifyInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      actorId: input.actorId ?? null,
      domain: input.domain,
      type: input.type,
      title: input.title,
      message: input.message,
      href: input.href ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload,
      dedupeKey: clean(input.dedupeKey),
    },
    include: {
      user: { include: { user: { select: { email: true, name: true } } } },
      deliveries: true,
    },
  });
}

async function getOrCreateNotification(input: NotifyInput) {
  const dedupeKey = clean(input.dedupeKey);
  if (!dedupeKey) {
    return { record: await createNotification(input), created: true };
  }

  const existing = await prisma.notification.findUnique({
    where: { dedupeKey },
    include: {
      user: { include: { user: { select: { email: true, name: true } } } },
      deliveries: true,
    },
  });
  if (existing) {
    if (input.resetReadOnDedupe) {
      const updated = await prisma.notification.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          message: input.message,
          href: input.href ?? null,
          payload: input.payload,
        },
        include: {
          user: { include: { user: { select: { email: true, name: true } } } },
          deliveries: true,
        },
      });
      return { record: updated, created: false };
    }
    return { record: existing, created: false };
  }

  try {
    return { record: await createNotification(input), created: true };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await prisma.notification.findUniqueOrThrow({
      where: { dedupeKey },
      include: {
        user: { include: { user: { select: { email: true, name: true } } } },
        deliveries: true,
      },
    });
    return { record: raced, created: false };
  }
}

async function ensureInAppDelivery(notificationId: string, resetRead: boolean) {
  await prisma.notificationDelivery.upsert({
    where: {
      notificationId_channel: {
        notificationId,
        channel: IN_APP_CHANNEL,
      },
    },
    update: {
      status: "SENT",
      sentAt: new Date(),
      skippedReason: null,
      failedReason: null,
      ...(resetRead ? { readAt: null } : {}),
    },
    create: {
      notificationId,
      channel: IN_APP_CHANNEL,
      status: "SENT",
      sentAt: new Date(),
    },
  });
}

function defaultEmail(record: NotificationRecord, options?: EmailOptions) {
  return {
    subject: options?.subject ?? record.title,
    category:
      options?.category ??
      `${record.domain}_${record.type.toLowerCase()}_notification`,
    react:
      options?.react ??
      createElement(NotificationEmail, {
        title: record.title,
        message: record.message,
        href: record.href,
      }),
    idempotencyKey:
      options?.idempotencyKey ??
      (record.dedupeKey ? `notification:${record.dedupeKey}` : record.id),
    dedupeWindowMs: options?.dedupeWindowMs,
    attachments: options?.attachments,
  };
}

async function ensureEmailDelivery(
  record: NotificationRecord,
  options?: EmailOptions,
) {
  const existing = deliveryFor(record, EMAIL_CHANNEL);
  if (existing?.status === "SENT" || existing?.status === "PENDING") {
    return;
  }

  const delivery = await prisma.notificationDelivery.upsert({
    where: {
      notificationId_channel: {
        notificationId: record.id,
        channel: EMAIL_CHANNEL,
      },
    },
    update: {
      status: "PENDING",
      skippedReason: null,
      failedReason: null,
      providerMetadata: undefined,
    },
    create: {
      notificationId: record.id,
      channel: EMAIL_CHANNEL,
      status: "PENDING",
    },
  });

  const to = clean(options?.to) ?? record.user.user.email;
  if (!to) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: "SKIPPED", skippedReason: "no-email-on-file" },
    });
    return;
  }

  const email = defaultEmail(record, options);
  try {
    const result = await sendEmail({
      to,
      subject: email.subject,
      category: email.category,
      react: email.react,
      idempotencyKey: email.idempotencyKey,
      dedupeWindowMs: email.dedupeWindowMs,
      attachments: email.attachments,
    });

    if (result.status === "sent") {
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          skippedReason: null,
          failedReason: null,
          providerMetadata: result.deliveryId
            ? { emailDeliveryId: result.deliveryId }
            : undefined,
        },
      });
      return;
    }

    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SKIPPED",
        skippedReason: result.reason ?? "skipped",
        providerMetadata: result.deliveryId
          ? { emailDeliveryId: result.deliveryId }
          : undefined,
      },
    });
  } catch (error) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        failedReason:
          error instanceof Error ? error.message.slice(0, 2000) : String(error),
      },
    });
  }
}

export async function notify(input: NotifyInput) {
  if (!input.userId) return null;
  const channels = uniqueChannels(input.channels);
  const { record, created } = await getOrCreateNotification(input);
  const resetRead = input.resetReadOnDedupe && !created;

  if (channels.includes(IN_APP_CHANNEL)) {
    await ensureInAppDelivery(record.id, Boolean(resetRead));
  }

  if (channels.includes(EMAIL_CHANNEL)) {
    await ensureEmailDelivery(record, input.email);
  }

  return record;
}

export async function listUnreadInAppNotifications(userId: string, take = 20) {
  return prisma.notificationDelivery.findMany({
    where: {
      channel: IN_APP_CHANNEL,
      readAt: null,
      notification: { userId },
    },
    include: { notification: true },
    orderBy: { createdAt: "asc" },
    take,
  });
}

export async function markInAppNotificationsRead(
  userId: string,
  deliveryIds: string[],
) {
  if (deliveryIds.length === 0) return;
  await prisma.notificationDelivery.updateMany({
    where: {
      id: { in: deliveryIds },
      channel: IN_APP_CHANNEL,
      readAt: null,
      notification: { userId },
    },
    data: { readAt: new Date() },
  });
}

export async function retryNotificationEmail(
  notificationId: string,
  email?: EmailOptions,
) {
  const record = await loadNotification(notificationId);
  if (!record) return { error: "Notification not found" };
  await ensureEmailDelivery(
    {
      ...record,
      deliveries: record.deliveries.filter((d) => d.channel !== EMAIL_CHANNEL),
    },
    email,
  );
  return { success: true };
}

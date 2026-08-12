import type { Prisma } from "@prisma/client";
import type React from "react";
import { createElement } from "react";
import NotificationEmail from "@/emails/NotificationEmail";
import { isDeliverySettled } from "@/lib/delivery-staleness";
import { sendDirectMessage } from "@/lib/discord";
import { sendEmail } from "@/lib/email";
import { catalogChannelDefaults } from "@/lib/notifications/catalog";
import prisma from "@/lib/prisma";
import { USER_IDENTITY_SELECT } from "@/lib/prisma-select";

export const IN_APP_CHANNEL = "in_app";
export const EMAIL_CHANNEL = "email";
export const DISCORD_CHANNEL = "discord";

export type NotificationChannel =
  | typeof IN_APP_CHANNEL
  | typeof EMAIL_CHANNEL
  | typeof DISCORD_CHANNEL;
export type NotificationChannelDefaults = Partial<
  Record<NotificationChannel, boolean>
>;

// Channel defaults come from the notification catalog so the settings UI,
// help page, and engine can never disagree.
const BUILT_IN_CHANNEL_DEFAULTS: Record<string, NotificationChannelDefaults> =
  catalogChannelDefaults();

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

function uniqueChannels(
  channels: NotificationChannel[] | undefined,
): NotificationChannel[] {
  const fallback: NotificationChannel[] = [IN_APP_CHANNEL];
  return [
    ...new Set<NotificationChannel>(channels?.length ? channels : fallback),
  ];
}

function preferenceKey(domain: string, type: string) {
  return `${domain}:${type}`;
}

export function defaultChannelEnabled(
  domain: string,
  type: string,
  channel: NotificationChannel,
  defaults?: NotificationChannelDefaults,
) {
  return (
    defaults?.[channel] ??
    BUILT_IN_CHANNEL_DEFAULTS[preferenceKey(domain, type)]?.[channel] ??
    true
  );
}

export async function enabledNotificationChannels(
  userId: string,
  domain: string,
  type: string,
  channels: NotificationChannel[],
  defaults?: NotificationChannelDefaults,
) {
  const requestedChannels = uniqueChannels(channels);
  const preferences = await prisma.notificationPreference.findMany({
    where: {
      userId,
      domain,
      type,
      channel: { in: requestedChannels },
    },
    select: { channel: true, enabled: true },
  });
  const preferenceByChannel = new Map(
    preferences.map((preference) => [preference.channel, preference.enabled]),
  );

  return requestedChannels.filter((channel) => {
    const stored = preferenceByChannel.get(channel);
    if (stored != null) return stored;
    return defaultChannelEnabled(domain, type, channel, defaults);
  });
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
      user: { include: { user: { select: USER_IDENTITY_SELECT } } },
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
      user: { include: { user: { select: USER_IDENTITY_SELECT } } },
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
      user: { include: { user: { select: USER_IDENTITY_SELECT } } },
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
          user: { include: { user: { select: USER_IDENTITY_SELECT } } },
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
        user: { include: { user: { select: USER_IDENTITY_SELECT } } },
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
  if (existing && isDeliverySettled(existing)) {
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

/**
 * Discord DM delivery. Records the same delivery row shape as email so a
 * skipped send (no linked account, bot token unset, DMs closed) is visible in
 * the notification's history rather than silently absent.
 */
async function ensureDiscordDelivery(record: NotificationRecord) {
  const existing = deliveryFor(record, DISCORD_CHANNEL);
  if (existing && isDeliverySettled(existing)) return;

  const delivery = await prisma.notificationDelivery.upsert({
    where: {
      notificationId_channel: {
        notificationId: record.id,
        channel: DISCORD_CHANNEL,
      },
    },
    update: { status: "PENDING", skippedReason: null, failedReason: null },
    create: {
      notificationId: record.id,
      channel: DISCORD_CHANNEL,
      status: "PENDING",
    },
  });

  const discordId = record.user.discordId;
  if (!discordId) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: "SKIPPED", skippedReason: "no-discord-account-linked" },
    });
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const sent = await sendDirectMessage(discordId, {
    content: `**${record.title}**\n${record.message}`,
    url: record.href ? `${appUrl}${record.href}` : null,
  });

  await prisma.notificationDelivery.update({
    where: { id: delivery.id },
    data: sent
      ? { status: "SENT", sentAt: new Date(), skippedReason: null }
      : { status: "SKIPPED", skippedReason: "discord-delivery-unavailable" },
  });
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

  if (channels.includes(DISCORD_CHANNEL)) {
    await ensureDiscordDelivery(record);
  }

  return record;
}

export async function notifyWithPreferences(
  input: NotifyInput,
  defaults?: NotificationChannelDefaults,
) {
  if (!input.userId) return null;
  const channels = await enabledNotificationChannels(
    input.userId,
    input.domain,
    input.type,
    uniqueChannels(input.channels),
    defaults,
  );
  if (channels.length === 0) return null;
  return notify({ ...input, channels });
}

type InAppDelivery = Prisma.NotificationDeliveryGetPayload<{
  include: { notification: true };
}>;

export type SerializedNotification = {
  id: string;
  notificationId: string;
  domain: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: Prisma.JsonValue;
  readAt: string | null;
  createdAt: string;
};

/** Flatten an in-app delivery (+ its notification) into the shape the toast,
 * bell, and notifications page consume. */
export function serializeInAppDelivery(
  delivery: InAppDelivery,
): SerializedNotification {
  return {
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
    readAt: delivery.readAt?.toISOString() ?? null,
    createdAt: delivery.notification.createdAt.toISOString(),
  };
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

/** In-app deliveries that have not yet been shown as a toast. Drives the
 * NotificationPoller; oldest-first so toasts surface in arrival order. */
export async function listUnseenInAppNotifications(userId: string, take = 30) {
  return prisma.notificationDelivery.findMany({
    where: {
      channel: IN_APP_CHANNEL,
      seenAt: null,
      notification: { userId },
    },
    include: { notification: true },
    orderBy: { createdAt: "asc" },
    take,
  });
}

/** Recent in-app deliveries regardless of read state. Drives the bell
 * dropdown and the notifications page; newest-first. */
export async function listInAppNotifications(userId: string, take = 30) {
  return prisma.notificationDelivery.findMany({
    where: {
      channel: IN_APP_CHANNEL,
      notification: { userId },
    },
    include: { notification: true },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function countUnreadInAppNotifications(userId: string) {
  return prisma.notificationDelivery.count({
    where: {
      channel: IN_APP_CHANNEL,
      readAt: null,
      notification: { userId },
    },
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

export async function markAllInAppNotificationsRead(userId: string) {
  await prisma.notificationDelivery.updateMany({
    where: {
      channel: IN_APP_CHANNEL,
      readAt: null,
      notification: { userId },
    },
    data: { readAt: new Date() },
  });
}

/** Records that toasts have been shown for these deliveries so they are not
 * re-toasted. Distinct from read state — a seen item stays unread until the
 * user opens the inbox. */
export async function markInAppNotificationsSeen(
  userId: string,
  deliveryIds: string[],
) {
  if (deliveryIds.length === 0) return;
  await prisma.notificationDelivery.updateMany({
    where: {
      id: { in: deliveryIds },
      channel: IN_APP_CHANNEL,
      seenAt: null,
      notification: { userId },
    },
    data: { seenAt: new Date() },
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

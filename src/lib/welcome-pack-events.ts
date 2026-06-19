import type { Prisma, PrismaClient } from "@prisma/client";

export type WelcomePackOrderEventType =
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "ADMIN_CANCELLED"
  | "SHIPPED"
  | "DELIVERED"
  | "REOPENED"
  | "SELECTIONS_UPDATED"
  | "SHIPPING_UPDATED"
  | "TRACKING_UPDATED"
  | "LOGISTICS_UPDATED"
  | "ESTIMATE_UPDATED"
  | "DELAYED"
  | "USER_UPDATED"
  | "ITEM_CONFIG_CHANGED"
  | "NOTIFICATION_RESENT"
  | "PARCEL_CUSTOMS_UPDATED"
  | "EASYPARCEL_EXPORTED";

export type WelcomePackOrderActorRole = "ADMIN" | "USER" | "SYSTEM";

type EventDb = PrismaClient | Prisma.TransactionClient;

/**
 * Append one entry to an order's audit trail. Accepts a transaction client so
 * the event commits atomically with the transition/edit it records.
 */
export async function logOrderEvent(
  db: EventDb,
  input: {
    orderId: string;
    actorId: string | null;
    actorRole: WelcomePackOrderActorRole;
    type: WelcomePackOrderEventType;
    message?: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await db.welcomePackOrderEvent.create({
    data: {
      orderId: input.orderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      type: input.type,
      message: input.message ?? null,
      metadata: input.metadata,
    },
  });
}

/**
 * Changed-keys-only before/after diff for edit-event metadata. Values are
 * compared with JSON.stringify so arrays/objects work; unchanged keys are
 * dropped to keep the audit entries readable.
 */
export function diffForEvent<T extends Record<string, unknown>>(
  before: T,
  after: T,
  keys: (keyof T & string)[],
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changedBefore[key] = before[key] ?? null;
      changedAfter[key] = after[key] ?? null;
    }
  }
  return { before: changedBefore, after: changedAfter };
}

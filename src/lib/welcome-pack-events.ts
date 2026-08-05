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

/**
 * Shipping fields that locate a person. Cleared by the retention sweep and
 * redacted out of audit metadata.
 */
export const WELCOME_PACK_ADDRESS_FIELDS = [
  "recipientName",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "stateProvince",
  "postalCode",
  "taxId",
] as const;

/**
 * Strips located values out of an event's {before, after} diff while keeping
 * the key set. Admins keep "which fields changed, when, and by whom" — the
 * audit property that matters — and lose only the stale values, which would
 * otherwise preserve a full address history that outlives the order itself.
 */
export function redactOrderEventMetadata(
  metadata: unknown,
  placeholder = "[redacted]",
): unknown {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata;
  }
  const record = metadata as Record<string, unknown>;
  const redactSide = (side: unknown) => {
    if (!side || typeof side !== "object" || Array.isArray(side)) return side;
    const entries = Object.entries(side as Record<string, unknown>).map(
      ([key, value]) =>
        (WELCOME_PACK_ADDRESS_FIELDS as readonly string[]).includes(key)
          ? [key, value === null ? null : placeholder]
          : [key, value],
    );
    return Object.fromEntries(entries);
  };

  if (!("before" in record) && !("after" in record)) return metadata;
  return {
    ...record,
    ...("before" in record ? { before: redactSide(record.before) } : {}),
    ...("after" in record ? { after: redactSide(record.after) } : {}),
    _redacted: true,
  };
}

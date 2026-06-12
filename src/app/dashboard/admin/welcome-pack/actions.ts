"use server";

import { Prisma, type WelcomePackOrderStatus } from "@prisma/client";
import dayjs from "dayjs";
import { revalidatePath } from "next/cache";
import { createElement } from "react";
import WelcomePackOrderApproved from "@/emails/WelcomePackOrderApproved";
import WelcomePackOrderDelivered from "@/emails/WelcomePackOrderDelivered";
import WelcomePackOrderRejected from "@/emails/WelcomePackOrderRejected";
import WelcomePackOrderShipped from "@/emails/WelcomePackOrderShipped";
import { requireAdmin } from "@/lib/authz";
import { deleteWelcomePackBlob } from "@/lib/blob-storage";
import { sendEmail } from "@/lib/email";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import prisma from "@/lib/prisma";
import type {
  EligibilitySnapshot,
  QualifyingLinearIssue,
} from "@/lib/welcome-pack-eligibility";
import { diffForEvent, logOrderEvent } from "@/lib/welcome-pack-events";
import {
  parseOrderFields,
  validateSelections,
} from "@/lib/welcome-pack-validation";

function refreshAdminPaths() {
  revalidatePath("/dashboard/admin/welcome-pack");
  revalidatePath("/dashboard/welcome-pack");
}

// ── Email helper ────────────────────────────────────────────────────────────

export type EmailOutcome = { sent: boolean; detail?: string };

/**
 * Send without throwing so a provider hiccup can't fail the action — but
 * surface the outcome to the UI instead of swallowing it.
 */
async function trySendEmail(
  args: Parameters<typeof sendEmail>[0],
): Promise<EmailOutcome> {
  try {
    const result = await sendEmail(args);
    if (result.status === "sent") return { sent: true };
    return { sent: false, detail: result.reason ?? "skipped" };
  } catch (error) {
    console.error(`[welcome-pack] email (${args.category}) failed:`, error);
    return { sent: false, detail: "failed" };
  }
}

function validateTrackingUrl(
  url: string | undefined,
): { ok: true; url: string | null } | { ok: false; error: string } {
  const cleaned = url?.trim();
  if (!cleaned) return { ok: true, url: null };
  try {
    const parsed = new URL(cleaned);
    // The URL lands as a clickable href in the user UI and in emails —
    // never allow javascript:/data:/etc schemes.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Tracking URL must be an http(s) link" };
    }
    return { ok: true, url: cleaned };
  } catch {
    return { ok: false, error: "Tracking URL is not a valid URL" };
  }
}

const OPEN_ORDER_STATUSES: WelcomePackOrderStatus[] = [
  "PENDING",
  "APPROVED",
  "SHIPPED",
];

// ── Pack config ─────────────────────────────────────────────────────────────

export type IdCardWrapMode = "nowrap" | "truncate" | "wrap" | "shrink";
export type IdCardAlign = "left" | "center" | "right";

const WRAP_MODES: ReadonlySet<string> = new Set([
  "nowrap",
  "truncate",
  "wrap",
  "shrink",
]);
const ALIGNS: ReadonlySet<string> = new Set(["left", "center", "right"]);

export type WelcomePackConfigInput = {
  packId?: string;
  name: string;
  description?: string;
  isActive: boolean;
  wave2Open: boolean;
  orderingEnabled: boolean;
  /** ISO datetime strings; null clears the bound. */
  ordersOpenAt?: string | null;
  ordersCloseAt?: string | null;
  idCardWidth?: number | null;
  idCardHeight?: number | null;
  idCardNameX?: number | null;
  idCardNameY?: number | null;
  idCardFontSize?: number | null;
  idCardFontColor?: string | null;
  idCardFontFamily?: string | null;
  idCardNameMaxWidth?: number | null;
  idCardNameMaxHeight?: number | null;
  idCardNameAlign?: IdCardAlign | null;
  idCardNameWrapMode?: IdCardWrapMode | null;
};

function parseWindowDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Creates the active welcome pack on first call (when no packId given) or
 * updates the existing one. Image fields are managed by the upload API route.
 */
export async function saveWelcomePackConfig(input: WelcomePackConfigInput) {
  await requireAdmin();

  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    return { error: "Name must be at least 2 characters" };
  }

  const ordersOpenAt = parseWindowDate(input.ordersOpenAt);
  const ordersCloseAt = parseWindowDate(input.ordersCloseAt);
  if (ordersOpenAt && ordersCloseAt && ordersCloseAt <= ordersOpenAt) {
    return { error: "Ordering close time must be after the open time" };
  }

  const wrapMode =
    input.idCardNameWrapMode && WRAP_MODES.has(input.idCardNameWrapMode)
      ? input.idCardNameWrapMode
      : null;
  const align =
    input.idCardNameAlign && ALIGNS.has(input.idCardNameAlign)
      ? input.idCardNameAlign
      : null;

  const data = {
    name: trimmedName,
    description: input.description?.trim() || null,
    isActive: input.isActive,
    wave2Open: input.wave2Open,
    orderingEnabled: input.orderingEnabled,
    ordersOpenAt,
    ordersCloseAt,
    idCardWidth: input.idCardWidth ?? null,
    idCardHeight: input.idCardHeight ?? null,
    idCardNameX: input.idCardNameX ?? null,
    idCardNameY: input.idCardNameY ?? null,
    idCardFontSize: input.idCardFontSize ?? null,
    idCardFontColor: input.idCardFontColor?.trim() || null,
    idCardFontFamily: input.idCardFontFamily?.trim() || null,
    idCardNameMaxWidth: input.idCardNameMaxWidth ?? null,
    idCardNameMaxHeight: input.idCardNameMaxHeight ?? null,
    idCardNameAlign: align,
    idCardNameWrapMode: wrapMode,
  };

  // Single-active-pack invariant: activating this pack deactivates siblings
  // in the same transaction so the user page, submit action and admin page
  // can never disagree about which pack is live.
  const pack = await prisma.$transaction(async (tx) => {
    if (input.isActive) {
      await tx.welcomePack.updateMany({
        where: {
          isActive: true,
          ...(input.packId ? { id: { not: input.packId } } : {}),
        },
        data: { isActive: false },
      });
    }
    return input.packId
      ? tx.welcomePack.update({ where: { id: input.packId }, data })
      : tx.welcomePack.create({ data: { ...data, currentWave: 1 } });
  });

  // Deactivating a pack with in-flight orders is allowed but worth flagging —
  // those orders still need fulfillment.
  let openOrders = 0;
  if (!input.isActive && input.packId) {
    openOrders = await prisma.welcomePackOrder.count({
      where: { packId: input.packId, status: { in: OPEN_ORDER_STATUSES } },
    });
  }

  refreshAdminPaths();
  return {
    success: true,
    packId: pack.id,
    ...(openOrders > 0 ? { openOrdersWarning: openOrders } : {}),
  };
}

// ── Items ───────────────────────────────────────────────────────────────────

export type WelcomePackItemInput = {
  itemId?: string;
  packId: string;
  name: string;
  description?: string;
  requiresSize: boolean;
  sizeOptions: string[];
  displayOrder: number;
  isActive: boolean;
  /**
   * Size/requiresSize changes that would invalidate selections on open
   * orders are blocked unless force is set; the affected count is returned
   * so the UI can confirm.
   */
  force?: boolean;
};

export async function saveWelcomePackItem(input: WelcomePackItemInput) {
  const adminId = await requireAdmin();

  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    return { error: "Item name must be at least 2 characters" };
  }

  const sizeOptions = input.requiresSize
    ? input.sizeOptions.map((s) => s.trim()).filter(Boolean)
    : [];

  if (input.requiresSize && sizeOptions.length === 0) {
    return { error: "Add at least one size option for sized items" };
  }

  // Guard config drift: editing sizes out from under open orders silently
  // breaks fulfillment (the tally would miss them, or sized items ship
  // sizeless).
  let affectedOrderIds: string[] = [];
  if (input.itemId) {
    const sizeSet = new Set(sizeOptions);
    const affected = await prisma.welcomePackOrderItemSelection.findMany({
      where: {
        itemId: input.itemId,
        order: { status: { in: ["PENDING", "APPROVED"] } },
      },
      select: { selectedSize: true, orderId: true },
    });
    affectedOrderIds = affected
      .filter((s) =>
        input.requiresSize
          ? !s.selectedSize || !sizeSet.has(s.selectedSize)
          : false,
      )
      .map((s) => s.orderId);

    if (affectedOrderIds.length > 0 && !input.force) {
      return {
        error: `${affectedOrderIds.length} open order(s) have selections this change would invalidate. Fix the orders first, or save again with force.`,
        requiresForce: true,
        affectedOrders: affectedOrderIds.length,
      };
    }
  }

  const data = {
    name: trimmedName,
    description: input.description?.trim() || null,
    requiresSize: input.requiresSize,
    sizeOptions,
    displayOrder: input.displayOrder,
    isActive: input.isActive,
  };

  const item = await prisma.$transaction(async (tx) => {
    const saved = input.itemId
      ? await tx.welcomePackItem.update({
          where: { id: input.itemId },
          data,
        })
      : await tx.welcomePackItem.create({
          data: { ...data, packId: input.packId },
        });
    // Leave a breadcrumb on each order whose selection drifted.
    for (const orderId of affectedOrderIds) {
      await logOrderEvent(tx, {
        orderId,
        actorId: adminId,
        actorRole: "ADMIN",
        type: "ITEM_CONFIG_CHANGED",
        message: `Item "${trimmedName}" was reconfigured; this order's selection for it may need fixing.`,
      });
    }
    return saved;
  });

  refreshAdminPaths();
  return { success: true, itemId: item.id };
}

export async function deleteWelcomePackItem(itemId: string) {
  await requireAdmin();

  const item = await prisma.welcomePackItem.findUnique({
    where: { id: itemId },
    select: {
      imageBlobUrl: true,
      sizeChartBlobUrl: true,
      _count: { select: { selections: true } },
    },
  });
  if (!item) return { error: "Item not found" };

  if (item._count.selections > 0) {
    // Don't break historical orders — soft-disable instead.
    await prisma.welcomePackItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });
    refreshAdminPaths();
    return {
      success: true,
      softDeleted: true,
      message: "Item used in existing orders — marked inactive instead.",
    };
  }

  await prisma.welcomePackItem.delete({ where: { id: itemId } });
  await Promise.all([
    deleteWelcomePackBlob(item.imageBlobUrl),
    deleteWelcomePackBlob(item.sizeChartBlobUrl),
  ]);

  refreshAdminPaths();
  return { success: true };
}

// ── Order transitions ───────────────────────────────────────────────────────

async function loadOrderForEmail(orderId: string) {
  return prisma.welcomePackOrder.findUnique({
    where: { id: orderId },
    include: {
      user: {
        include: { user: { select: { email: true, name: true } } },
      },
    },
  });
}

function recipientFromOrder(
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForEmail>>>,
) {
  return {
    email: order.user.user.email,
    name:
      order.user.legalName ||
      order.recipientName ||
      order.user.user.name ||
      "Developer",
  };
}

async function statusConflictError(orderId: string) {
  const exists = await prisma.welcomePackOrder.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  return {
    error: exists
      ? `Order is already ${exists.status.toLowerCase()}`
      : "Order not found",
  };
}

/**
 * CAS status transition + audit event, committed atomically. Returns false
 * when the order wasn't in one of `from` (a concurrent change won the race —
 * also what prevents double-emails when two admins click simultaneously).
 *
 * Every admin status change flows through here so the activeUserId invariant
 * (NULL once CANCELLED/REJECTED, the user's id otherwise) is maintained by
 * the `data` of each transition in one visible place.
 */
async function transitionOrder(opts: {
  orderId: string;
  from: WelcomePackOrderStatus[];
  data: Prisma.WelcomePackOrderUpdateManyMutationInput;
  event: Omit<Parameters<typeof logOrderEvent>[1], "orderId">;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.welcomePackOrder.updateMany({
      where: { id: opts.orderId, status: { in: opts.from } },
      data: opts.data,
    });
    if (result.count === 0) return false;
    await logOrderEvent(tx, { orderId: opts.orderId, ...opts.event });
    return true;
  });
}

type NotifiableStatus = "APPROVED" | "REJECTED" | "SHIPPED" | "DELIVERED";

function buildStatusEmail(
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForEmail>>>,
  recipientName: string,
  status: NotifiableStatus,
): { subject: string; category: string; react: React.ReactElement } {
  switch (status) {
    case "APPROVED":
      return {
        subject: "Welcome Pack order approved",
        category: "welcome_pack_order_approved",
        react: createElement(WelcomePackOrderApproved, {
          userName: recipientName,
          idCardName: order.idCardName,
        }),
      };
    case "REJECTED":
      return {
        subject: "Welcome Pack order update",
        category: "welcome_pack_order_rejected",
        react: createElement(WelcomePackOrderRejected, {
          userName: recipientName,
          reason: order.rejectionReason ?? undefined,
        }),
      };
    case "SHIPPED":
      return {
        subject: "Welcome Pack on the way",
        category: "welcome_pack_order_shipped",
        react: createElement(WelcomePackOrderShipped, {
          userName: recipientName,
          trackingNumber: order.trackingNumber ?? "",
          trackingUrl: order.trackingUrl,
        }),
      };
    case "DELIVERED":
      return {
        subject: "Welcome Pack delivered",
        category: "welcome_pack_order_delivered",
        react: createElement(WelcomePackOrderDelivered, {
          userName: recipientName,
        }),
      };
  }
}

/**
 * Email the developer the notification matching `status`, reading the
 * freshly-transitioned order. Callers pass timestamped idempotency keys so a
 * re-fired transition (e.g. approve after reopen) sends a new notification
 * instead of being deduped against the first one.
 */
async function sendStatusEmail(
  orderId: string,
  status: NotifiableStatus,
  opts: { idempotencyKey?: string; dedupeWindowMs?: false; subject?: string },
): Promise<EmailOutcome> {
  const order = await loadOrderForEmail(orderId);
  if (!order) return { sent: false, detail: "order-not-found" };
  const recipient = recipientFromOrder(order);
  if (!recipient.email) return { sent: false, detail: "no-email-on-file" };
  const content = buildStatusEmail(order, recipient.name, status);
  return trySendEmail({
    to: recipient.email,
    subject: opts.subject ?? content.subject,
    category: content.category,
    react: content.react,
    idempotencyKey: opts.idempotencyKey,
    dedupeWindowMs: opts.dedupeWindowMs,
  });
}

export async function approveWelcomePackOrder(orderId: string) {
  const adminId = await requireAdmin();

  const approvedAt = new Date();
  const ok = await transitionOrder({
    orderId,
    from: ["PENDING"],
    data: { status: "APPROVED", approvedAt },
    event: {
      actorId: adminId,
      actorRole: "ADMIN",
      type: "APPROVED",
      message: "Order approved",
    },
  });
  if (!ok) return statusConflictError(orderId);

  const email = await sendStatusEmail(orderId, "APPROVED", {
    idempotencyKey: `welcome-pack:approved:${orderId}:${approvedAt.getTime()}`,
  });

  refreshAdminPaths();
  return { success: true, emailSent: email.sent, emailDetail: email.detail };
}

export async function rejectWelcomePackOrder(orderId: string, reason?: string) {
  const adminId = await requireAdmin();

  const rejectedAt = new Date();
  const cleanReason = reason?.trim() || null;
  const ok = await transitionOrder({
    orderId,
    from: ["PENDING"],
    // Frees the user's active-order slot so they can re-order.
    data: {
      status: "REJECTED",
      rejectionReason: cleanReason,
      activeUserId: null,
    },
    event: {
      actorId: adminId,
      actorRole: "ADMIN",
      type: "REJECTED",
      message: "Order rejected",
      metadata: cleanReason ? { reason: cleanReason } : undefined,
    },
  });
  if (!ok) return statusConflictError(orderId);

  const email = await sendStatusEmail(orderId, "REJECTED", {
    idempotencyKey: `welcome-pack:rejected:${orderId}:${rejectedAt.getTime()}`,
  });

  refreshAdminPaths();
  return { success: true, emailSent: email.sent, emailDetail: email.detail };
}

export async function markWelcomePackOrderShipped(
  orderId: string,
  trackingNumber: string,
  trackingUrl?: string,
) {
  const adminId = await requireAdmin();

  const tracking = trackingNumber.trim();
  if (tracking.length === 0) {
    return { error: "Tracking number is required" };
  }
  const url = validateTrackingUrl(trackingUrl);
  if (!url.ok) return { error: url.error };

  const shippedAt = new Date();
  const ok = await transitionOrder({
    orderId,
    from: ["APPROVED"],
    data: {
      status: "SHIPPED",
      shippedAt,
      trackingNumber: tracking,
      trackingUrl: url.url,
    },
    event: {
      actorId: adminId,
      actorRole: "ADMIN",
      type: "SHIPPED",
      message: `Marked shipped (tracking ${tracking})`,
    },
  });
  if (!ok) return statusConflictError(orderId);

  const email = await sendStatusEmail(orderId, "SHIPPED", {
    idempotencyKey: `welcome-pack:shipped:${orderId}:${shippedAt.getTime()}`,
  });

  refreshAdminPaths();
  return { success: true, emailSent: email.sent, emailDetail: email.detail };
}

export async function markWelcomePackOrderDelivered(orderId: string) {
  const adminId = await requireAdmin();

  const deliveredAt = new Date();
  const ok = await transitionOrder({
    orderId,
    from: ["SHIPPED"],
    data: { status: "DELIVERED", deliveredAt },
    event: {
      actorId: adminId,
      actorRole: "ADMIN",
      type: "DELIVERED",
      message: "Marked delivered",
    },
  });
  if (!ok) return statusConflictError(orderId);

  const email = await sendStatusEmail(orderId, "DELIVERED", {
    idempotencyKey: `welcome-pack:delivered:${orderId}:${deliveredAt.getTime()}`,
  });

  refreshAdminPaths();
  return { success: true, emailSent: email.sent, emailDetail: email.detail };
}

/**
 * APPROVED → PENDING (un-approve) or REJECTED → PENDING (give the order
 * another look). Restores the user's active-order slot, which can conflict
 * with a newer order they placed in the meantime — surfaced as an error.
 */
export async function reopenWelcomePackOrder(orderId: string) {
  const adminId = await requireAdmin();

  const order = await prisma.welcomePackOrder.findUnique({
    where: { id: orderId },
    select: { userId: true, status: true },
  });
  if (!order) return { error: "Order not found" };
  if (order.status !== "APPROVED" && order.status !== "REJECTED") {
    return {
      error: `Order is ${order.status.toLowerCase()} — only approved or rejected orders can be reopened`,
    };
  }

  try {
    const ok = await transitionOrder({
      orderId,
      from: ["APPROVED", "REJECTED"],
      data: {
        status: "PENDING",
        approvedAt: null,
        rejectionReason: null,
        activeUserId: order.userId,
      },
      event: {
        actorId: adminId,
        actorRole: "ADMIN",
        type: "REOPENED",
        message: `Reopened from ${order.status.toLowerCase()}`,
        metadata: { from: order.status },
      },
    });
    if (!ok) return statusConflictError(orderId);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        error:
          "The developer already has another active order — reopening this one would create two.",
      };
    }
    throw error;
  }

  refreshAdminPaths();
  return { success: true };
}

export async function cancelWelcomePackOrderAdmin(
  orderId: string,
  reason?: string,
) {
  const adminId = await requireAdmin();

  const cleanReason = reason?.trim() || null;
  const ok = await transitionOrder({
    orderId,
    from: ["PENDING", "APPROVED"],
    data: { status: "CANCELLED", approvedAt: null, activeUserId: null },
    event: {
      actorId: adminId,
      actorRole: "ADMIN",
      type: "ADMIN_CANCELLED",
      message: "Order cancelled by admin",
      metadata: cleanReason ? { reason: cleanReason } : undefined,
    },
  });
  if (!ok) return statusConflictError(orderId);

  refreshAdminPaths();
  return { success: true };
}

// ── Order amendments ────────────────────────────────────────────────────────

const AMENDABLE_STATUSES: WelcomePackOrderStatus[] = ["PENDING", "APPROVED"];

export type AdminSelectionInput = {
  itemId: string;
  selectedSize?: string | null;
};

/**
 * Replace an order's item selections — covers size changes, swaps, and item
 * replacements in one primitive. Items already on the order may stay even if
 * since-deactivated; newly added items must be active.
 */
export async function updateWelcomePackOrderSelectionsAdmin(
  orderId: string,
  selections: AdminSelectionInput[],
) {
  const adminId = await requireAdmin();

  const order = await prisma.welcomePackOrder.findUnique({
    where: { id: orderId },
    include: {
      selections: { include: { item: { select: { name: true } } } },
      pack: {
        include: {
          items: {
            select: {
              id: true,
              name: true,
              requiresSize: true,
              sizeOptions: true,
              isActive: true,
            },
          },
        },
      },
    },
  });
  if (!order) return { error: "Order not found" };
  if (!AMENDABLE_STATUSES.includes(order.status)) {
    return {
      error: `Order is ${order.status.toLowerCase()} — selections can only be edited while pending or approved`,
    };
  }

  const existingIds = new Set(order.selections.map((s) => s.itemId));
  const allowedItems = order.pack.items.filter(
    (i) => i.isActive || existingIds.has(i.id),
  );
  const validated = validateSelections(allowedItems, selections, {
    requireAllItems: false,
  });
  if (!validated.ok) return { error: validated.error };

  const itemName = (id: string) =>
    order.pack.items.find((i) => i.id === id)?.name ?? id;
  const beforeList = order.selections
    .map((s) => `${s.item.name}${s.selectedSize ? ` (${s.selectedSize})` : ""}`)
    .sort();
  const afterList = validated.selections
    .map(
      (s) =>
        `${itemName(s.itemId)}${s.selectedSize ? ` (${s.selectedSize})` : ""}`,
    )
    .sort();
  if (JSON.stringify(beforeList) === JSON.stringify(afterList)) {
    return { success: true }; // no-op
  }

  const ok = await prisma.$transaction(async (tx) => {
    // No-op CAS update: locks the row and re-verifies the status gate so a
    // concurrent ship/cancel can't interleave with the rewrite below.
    const result = await tx.welcomePackOrder.updateMany({
      where: { id: orderId, status: { in: AMENDABLE_STATUSES } },
      data: { updatedAt: new Date() },
    });
    if (result.count === 0) return false;

    await tx.welcomePackOrderItemSelection.deleteMany({ where: { orderId } });
    await tx.welcomePackOrderItemSelection.createMany({
      data: validated.selections.map((s) => ({ ...s, orderId })),
    });
    await logOrderEvent(tx, {
      orderId,
      actorId: adminId,
      actorRole: "ADMIN",
      type: "SELECTIONS_UPDATED",
      message: "Items/sizes updated by admin",
      metadata: { before: beforeList, after: afterList },
    });
    return true;
  });
  if (!ok) return statusConflictError(orderId);

  refreshAdminPaths();
  return { success: true };
}

export type AdminShippingInput = {
  recipientName: string;
  phone: string;
  region: "DOMESTIC" | "INTERNATIONAL";
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateProvince?: string;
  postalCode: string;
  country: string;
  idCardName?: string;
};

export async function updateWelcomePackOrderShippingAdmin(
  orderId: string,
  input: AdminShippingInput,
) {
  const adminId = await requireAdmin();

  const order = await prisma.welcomePackOrder.findUnique({
    where: { id: orderId },
  });
  if (!order) return { error: "Order not found" };
  if (!AMENDABLE_STATUSES.includes(order.status)) {
    return {
      error: `Order is ${order.status.toLowerCase()} — shipping can only be edited while pending or approved`,
    };
  }

  const parsed = parseOrderFields({
    ...input,
    idCardName: input.idCardName ?? order.idCardName,
    notes: order.notes ?? undefined,
  });
  if (!parsed.ok) return { error: parsed.error };
  const fields = parsed.fields;

  const keys = [
    "idCardName",
    "region",
    "recipientName",
    "phone",
    "addressLine1",
    "addressLine2",
    "city",
    "stateProvince",
    "postalCode",
    "country",
  ] as const;
  const before = Object.fromEntries(keys.map((k) => [k, order[k] as unknown]));
  const afterValues = {
    idCardName: fields.idCardName,
    region: fields.region,
    recipientName: fields.recipientName,
    phone: fields.phone,
    addressLine1: fields.addressLine1,
    addressLine2: fields.addressLine2 || null,
    city: fields.city,
    stateProvince: fields.stateProvince || null,
    postalCode: fields.postalCode,
    country: fields.country,
  };
  const diff = diffForEvent(before, afterValues as Record<string, unknown>, [
    ...keys,
  ]);

  const ok = await prisma.$transaction(async (tx) => {
    const result = await tx.welcomePackOrder.updateMany({
      where: { id: orderId, status: { in: AMENDABLE_STATUSES } },
      data: afterValues,
    });
    if (result.count === 0) return false;
    await logOrderEvent(tx, {
      orderId,
      actorId: adminId,
      actorRole: "ADMIN",
      type: "SHIPPING_UPDATED",
      message: "Shipping details updated by admin",
      metadata: diff as unknown as Prisma.InputJsonValue,
    });
    return true;
  });
  if (!ok) return statusConflictError(orderId);

  refreshAdminPaths();
  return { success: true };
}

export async function updateWelcomePackOrderTrackingAdmin(
  orderId: string,
  trackingNumber: string,
  trackingUrl?: string,
  notifyUser?: boolean,
) {
  const adminId = await requireAdmin();

  const tracking = trackingNumber.trim();
  if (tracking.length === 0) {
    return { error: "Tracking number is required" };
  }
  const url = validateTrackingUrl(trackingUrl);
  if (!url.ok) return { error: url.error };

  const order = await prisma.welcomePackOrder.findUnique({
    where: { id: orderId },
    select: { status: true, trackingNumber: true, trackingUrl: true },
  });
  if (!order) return { error: "Order not found" };
  if (order.status !== "SHIPPED") {
    return {
      error: `Order is ${order.status.toLowerCase()} — tracking can only be edited while shipped`,
    };
  }

  const ok = await prisma.$transaction(async (tx) => {
    const result = await tx.welcomePackOrder.updateMany({
      where: { id: orderId, status: "SHIPPED" },
      data: { trackingNumber: tracking, trackingUrl: url.url },
    });
    if (result.count === 0) return false;
    await logOrderEvent(tx, {
      orderId,
      actorId: adminId,
      actorRole: "ADMIN",
      type: "TRACKING_UPDATED",
      message: "Tracking info updated by admin",
      metadata: {
        before: {
          trackingNumber: order.trackingNumber,
          trackingUrl: order.trackingUrl,
        },
        after: { trackingNumber: tracking, trackingUrl: url.url },
      },
    });
    return true;
  });
  if (!ok) return statusConflictError(orderId);

  let email: EmailOutcome | undefined;
  if (notifyUser) {
    // Key includes the tracking number so a genuine correction sends but
    // double-clicks don't.
    email = await sendStatusEmail(orderId, "SHIPPED", {
      subject: "Welcome Pack — updated tracking",
      idempotencyKey: `welcome-pack:tracking-updated:${orderId}:${tracking}`,
    });
  }

  refreshAdminPaths();
  return {
    success: true,
    ...(email ? { emailSent: email.sent, emailDetail: email.detail } : {}),
  };
}

/**
 * Deliberate re-send of the notification matching the order's current
 * status — for when the original send failed or was rate-limited. Skips
 * dedupe entirely; the admin is the idempotency control here.
 */
export async function resendOrderNotification(orderId: string) {
  const adminId = await requireAdmin();

  const order = await prisma.welcomePackOrder.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!order) return { error: "Order not found" };
  const status = order.status;
  if (
    status !== "APPROVED" &&
    status !== "REJECTED" &&
    status !== "SHIPPED" &&
    status !== "DELIVERED"
  ) {
    return {
      error: `No user notification exists for ${status.toLowerCase()} orders`,
    };
  }

  const email = await sendStatusEmail(orderId, status, {
    dedupeWindowMs: false,
  });
  if (!email.sent) {
    return { error: `Email not sent (${email.detail})` };
  }
  await logOrderEvent(prisma, {
    orderId,
    actorId: adminId,
    actorRole: "ADMIN",
    type: "NOTIFICATION_RESENT",
    message: `${status.toLowerCase()} notification re-sent`,
  });
  refreshAdminPaths();
  return { success: true };
}

// ── Eligibility evidence ────────────────────────────────────────────────────

const LIVE_LOOKBACK_MONTHS = 6;
const LIVE_EVIDENCE_LIMIT = 10;

/**
 * The persisted submission-time snapshot, fetched on demand so the orders
 * list payload stays small.
 */
export async function fetchOrderEligibilitySnapshot(
  orderId: string,
): Promise<
  | { ok: true; snapshot: EligibilitySnapshot | null }
  | { ok: false; message: string }
> {
  await requireAdmin();

  const order = await prisma.welcomePackOrder.findUnique({
    where: { id: orderId },
    select: { eligibilitySnapshot: true },
  });
  if (!order) return { ok: false, message: "Order not found" };
  return {
    ok: true,
    snapshot:
      (order.eligibilitySnapshot as unknown as EligibilitySnapshot) ?? null,
  };
}

export type LiveEligibilityResult =
  | {
      ok: true;
      snapshot: EligibilitySnapshot;
    }
  | {
      ok: false;
      reason: "reauth-required" | "no-linear-account" | "fetch-failed";
      message: string;
    };

/**
 * Fetch the order developer's *current* qualifying Linear issues, on-demand
 * from the admin orders view. Uses the developer's stored Linear OAuth token
 * via getLinearClient(developerUserId). Does not mutate the persisted
 * snapshot — it's purely for verification.
 */
export async function fetchLiveEligibilityEvidence(
  orderId: string,
): Promise<LiveEligibilityResult> {
  await requireAdmin();

  const order = await prisma.welcomePackOrder.findUnique({
    where: { id: orderId },
    select: { userId: true },
  });
  if (!order) {
    return { ok: false, reason: "fetch-failed", message: "Order not found" };
  }

  try {
    const fetched = await withLinearFallback(order.userId, async (client) => {
      const viewer = await client.viewer;
      const lookback = dayjs().subtract(LIVE_LOOKBACK_MONTHS, "month");
      const result = await client.issues({
        first: LIVE_EVIDENCE_LIMIT,
        filter: {
          assignee: { id: { eq: viewer.id } },
          completedAt: { gte: lookback.toDate() },
        },
      });
      return {
        nodes: result.nodes,
        hasNextPage: result.pageInfo?.hasNextPage ?? false,
      };
    });

    const qualifyingIssues: QualifyingLinearIssue[] = fetched.nodes.map(
      (issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        completedAt:
          (issue.completedAt instanceof Date
            ? issue.completedAt.toISOString()
            : (issue.completedAt as string | undefined)) ??
          new Date().toISOString(),
      }),
    );

    const wave: 1 | 2 = qualifyingIssues.length > 0 ? 1 : 2;
    const snapshot: EligibilitySnapshot = {
      wave,
      capturedAt: new Date().toISOString(),
      lookbackMonths: LIVE_LOOKBACK_MONTHS,
      qualifyingIssues,
      truncated: fetched.hasNextPage,
      note:
        wave === 1
          ? `Live check: ${qualifyingIssues.length} completed Linear issue(s) in the last ${LIVE_LOOKBACK_MONTHS} months${
              fetched.hasNextPage ? " (truncated)" : ""
            }.`
          : `Live check: 0 completed Linear issues in the last ${LIVE_LOOKBACK_MONTHS} months — would only qualify under Wave 2.`,
    };

    return { ok: true, snapshot };
  } catch (error) {
    if (error instanceof LinearReauthRequiredError) {
      return {
        ok: false,
        reason: "reauth-required",
        message:
          "The developer's Linear connection isn't active — ask them to reconnect to re-verify.",
      };
    }
    console.error("[welcome-pack] live eligibility check failed:", error);
    return {
      ok: false,
      reason: "fetch-failed",
      message: "Failed to query Linear. Try again in a moment.",
    };
  }
}

"use server";

import { Prisma, type ShippingRegion } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type React from "react";
import { createElement } from "react";
import WelcomePackOrderCancelled from "@/emails/WelcomePackOrderCancelled";
import WelcomePackOrderSubmitted from "@/emails/WelcomePackOrderSubmitted";
import { getSession } from "@/lib/auth-utils";
import { ADMIN_ACCESS_WHERE } from "@/lib/authz";
import { DISPLAY_NAME_SELECT, resolveDisplayName } from "@/lib/display-name";
import { EMAIL_CHANNEL, IN_APP_CHANNEL, notify } from "@/lib/notifications";
import prisma from "@/lib/prisma";
import { USER_IDENTITY_SELECT } from "@/lib/prisma-select";
import { assertEligibleForWelcomePack } from "@/lib/welcome-pack-eligibility";
import { diffForEvent, logOrderEvent } from "@/lib/welcome-pack-events";
import {
  getOrderingWindowState,
  orderingClosedMessage,
} from "@/lib/welcome-pack-ordering";
import {
  parseOrderFields,
  validateSelections,
} from "@/lib/welcome-pack-validation";

export type SubmitOrderInput = {
  idCardName: string;
  region: ShippingRegion;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateProvince?: string;
  postalCode: string;
  country: string;
  notes?: string;
  selections: { itemId: string; selectedSize?: string }[];
};

function refreshPaths() {
  revalidatePath("/dashboard/welcome-pack");
  revalidatePath("/dashboard/admin/welcome-pack");
}

async function notifyAdmins(input: {
  subject: string;
  category: string;
  idempotencyKey: string;
  react: React.ReactElement;
  title: string;
  message: string;
  orderId: string;
  type: string;
}) {
  const admins = await prisma.userProfile.findMany({
    where: ADMIN_ACCESS_WHERE,
    include: { user: { select: { email: true } } },
  });

  const results = await Promise.allSettled(
    admins.map((admin) =>
      notify({
        userId: admin.id,
        domain: "welcome_pack",
        type: input.type,
        title: input.title,
        message: input.message,
        href: "/dashboard/admin/welcome-pack",
        entityType: "welcome_pack_order",
        entityId: input.orderId,
        payload: { orderId: input.orderId },
        dedupeKey: `${input.idempotencyKey}:${admin.id}`,
        channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
        email: admin.user.email
          ? {
              to: admin.user.email,
              subject: input.subject,
              category: input.category,
              idempotencyKey: input.idempotencyKey,
              react: input.react,
            }
          : undefined,
      }),
    ),
  );
  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error(
        `[welcome-pack] admin notification to ${admins[i]?.user.email ?? admins[i]?.id} failed:`,
        result.reason,
      );
    }
  }
}

export async function submitWelcomePackOrder(input: SubmitOrderInput) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  // Load pack and active-order check in parallel — saves a round trip and
  // gives us `wave2Open` to feed into the eligibility check. The orderBy
  // keeps this deterministic if two packs are ever active simultaneously.
  const [existing, pack] = await Promise.all([
    prisma.welcomePackOrder.findUnique({
      where: { activeUserId: userId },
      select: { id: true },
    }),
    prisma.welcomePack.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            requiresSize: true,
            sizeOptions: true,
          },
        },
      },
    }),
  ]);

  if (existing) {
    return { error: "You already have an active welcome pack order." };
  }
  if (!pack) {
    return { error: "Welcome pack is not configured yet." };
  }

  // Server-side ordering window enforcement — the form may have been sitting
  // open since before the window closed. UI gating is advisory only.
  const window = getOrderingWindowState(pack);
  if (!window.open) {
    return { error: orderingClosedMessage(window) };
  }

  // Re-check eligibility on the server, reusing the wave2Open flag we just
  // loaded. The snapshot captures the qualifying Linear issues so admins can
  // audit each approval without re-querying Linear.
  let wave: 1 | 2;
  let eligibilitySnapshot: Awaited<
    ReturnType<typeof assertEligibleForWelcomePack>
  >["snapshot"];
  try {
    const result = await assertEligibleForWelcomePack(userId, pack.wave2Open);
    wave = result.wave;
    eligibilitySnapshot = result.snapshot;
  } catch (e) {
    return { error: (e as Error).message };
  }

  const parsed = parseOrderFields(input);
  if (!parsed.ok) return { error: parsed.error };
  const fields = parsed.fields;

  const validated = validateSelections(pack.items, input.selections, {
    requireAllItems: true,
  });
  if (!validated.ok) return { error: validated.error };

  const orderData = {
    userId,
    activeUserId: userId,
    packId: pack.id,
    wave,
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
    notes: fields.notes || null,
    eligibilitySnapshot:
      eligibilitySnapshot as unknown as Prisma.InputJsonValue,
    selections: {
      create: validated.selections,
    },
    events: {
      create: {
        actorId: userId,
        actorRole: "USER",
        type: "SUBMITTED",
        message: `Order submitted (wave ${wave})`,
      },
    },
  };

  const orderInclude = {
    user: { include: { user: { select: USER_IDENTITY_SELECT } } },
  } satisfies Prisma.WelcomePackOrderInclude;

  let order: Prisma.WelcomePackOrderGetPayload<{
    include: typeof orderInclude;
  }>;
  try {
    order = await prisma.welcomePackOrder.create({
      data: orderData,
      include: orderInclude,
    });
  } catch (error) {
    // P2002 = unique constraint violation on activeUserId. Race between the
    // existence check and create — handled cleanly so the user sees a
    // friendly message.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "You already have an active welcome pack order." };
    }
    throw error;
  }

  try {
    const developerName = resolveDisplayName({ profile: order.user });
    await notifyAdmins({
      subject: `New Welcome Pack order — ${developerName}`,
      category: "welcome_pack_order_submitted",
      idempotencyKey: `welcome-pack:submitted:${order.id}`,
      title: "New Welcome Pack order",
      message: `${developerName} submitted a welcome pack order.`,
      orderId: order.id,
      type: "SUBMITTED",
      react: createElement(WelcomePackOrderSubmitted, {
        developerName,
        // Never purged: retention only touches settled orders.
        recipientName: order.recipientName ?? "",
        region: order.region,
        wave: order.wave,
        idCardName: order.idCardName,
      }),
    });
  } catch (error) {
    console.error("[welcome-pack] admin notification failed:", error);
  }

  refreshPaths();
  return { success: true };
}

export async function cancelWelcomePackOrder() {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  const order = await prisma.welcomePackOrder.findUnique({
    where: { activeUserId: userId },
    select: {
      id: true,
      status: true,
      recipientName: true,
      user: { select: DISPLAY_NAME_SELECT },
    },
  });
  if (!order) return { error: "No order to cancel" };
  if (order.status !== "PENDING") {
    return {
      error: "Order is already being processed and cannot be cancelled",
    };
  }

  // CAS inside a transaction: the status guard prevents clobbering a
  // concurrent admin approval, and freeing activeUserId lets the user
  // re-order later.
  const cancelled = await prisma.$transaction(async (tx) => {
    const result = await tx.welcomePackOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "CANCELLED", activeUserId: null },
    });
    if (result.count === 0) return false;
    await logOrderEvent(tx, {
      orderId: order.id,
      actorId: userId,
      actorRole: "USER",
      type: "CANCELLED",
      message: "Order cancelled by the developer",
    });
    return true;
  });
  if (!cancelled) {
    return {
      error: "Order is already being processed and cannot be cancelled",
    };
  }

  try {
    const developerName = resolveDisplayName({ profile: order.user });
    await notifyAdmins({
      subject: `Welcome Pack order cancelled — ${developerName}`,
      category: "welcome_pack_order_cancelled",
      idempotencyKey: `welcome-pack:cancelled:${order.id}`,
      title: "Welcome Pack order cancelled",
      message: `${developerName} cancelled a pending welcome pack order.`,
      orderId: order.id,
      type: "CANCELLED",
      react: createElement(WelcomePackOrderCancelled, {
        developerName,
        // Never purged: retention only touches settled orders.
        recipientName: order.recipientName ?? "",
      }),
    });
  } catch (error) {
    console.error("[welcome-pack] cancel notification failed:", error);
  }

  refreshPaths();
  return { success: true };
}

export type UpdateMyOrderInput = Omit<SubmitOrderInput, "selections"> & {
  /** Sizes for the items already on the order; membership isn't editable. */
  selections: { itemId: string; selectedSize?: string }[];
};

/**
 * Lets the developer fix their own PENDING order (sizes, ID-card name,
 * shipping, notes) instead of cancelling and re-ordering. Locked the moment
 * an admin approves — the CAS update guarantees the edit can't land on a
 * non-PENDING order even if approval races it.
 *
 * Deliberately NOT gated on the ordering window: an amendment to an existing
 * order is not a new order, so closing the window must not strand users with
 * uncorrectable typos. Don't add getOrderingWindowState here.
 */
export async function updateMyWelcomePackOrder(input: UpdateMyOrderInput) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  const order = await prisma.welcomePackOrder.findUnique({
    where: { activeUserId: userId },
    include: {
      selections: {
        include: {
          item: {
            select: {
              id: true,
              name: true,
              requiresSize: true,
              sizeOptions: true,
            },
          },
        },
      },
    },
  });
  if (!order) return { error: "No active order to edit" };
  if (order.status !== "PENDING") {
    return { error: "Order is already being processed and can't be edited" };
  }

  const parsed = parseOrderFields(input);
  if (!parsed.ok) return { error: parsed.error };
  const fields = parsed.fields;

  // The editable item set is exactly what's on the order — admins control
  // membership; users only adjust sizes.
  const orderItems = order.selections.map((s) => s.item);
  const validated = validateSelections(orderItems, input.selections, {
    requireAllItems: true,
  });
  if (!validated.ok) return { error: validated.error };

  const before = {
    idCardName: order.idCardName,
    region: order.region,
    recipientName: order.recipientName,
    phone: order.phone,
    addressLine1: order.addressLine1,
    addressLine2: order.addressLine2,
    city: order.city,
    stateProvince: order.stateProvince,
    postalCode: order.postalCode,
    country: order.country,
    notes: order.notes,
    sizes: order.selections
      .map((s) => `${s.item.name}:${s.selectedSize ?? "—"}`)
      .sort(),
  };
  const after = {
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
    notes: fields.notes || null,
    sizes: validated.selections
      .map((s) => {
        const item = orderItems.find((i) => i.id === s.itemId);
        return `${item?.name ?? s.itemId}:${s.selectedSize ?? "—"}`;
      })
      .sort(),
  };

  const updated = await prisma.$transaction(async (tx) => {
    // The CAS update also takes the row lock, so a concurrent admin approve
    // blocks until this transaction commits (or sees CANCELLED/edited data).
    const result = await tx.welcomePackOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: {
        idCardName: after.idCardName,
        region: after.region,
        recipientName: after.recipientName,
        phone: after.phone,
        addressLine1: after.addressLine1,
        addressLine2: after.addressLine2,
        city: after.city,
        stateProvince: after.stateProvince,
        postalCode: after.postalCode,
        country: after.country,
        notes: after.notes,
      },
    });
    if (result.count === 0) return false;

    await tx.welcomePackOrderItemSelection.deleteMany({
      where: { orderId: order.id },
    });
    await tx.welcomePackOrderItemSelection.createMany({
      data: validated.selections.map((s) => ({ ...s, orderId: order.id })),
    });

    const { sizes: _b, ...beforeFields } = before;
    const { sizes: _a, ...afterFields } = after;
    const diff = diffForEvent(beforeFields, afterFields, [
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
      "notes",
    ]);
    if (JSON.stringify(before.sizes) !== JSON.stringify(after.sizes)) {
      diff.before.sizes = before.sizes;
      diff.after.sizes = after.sizes;
    }
    await logOrderEvent(tx, {
      orderId: order.id,
      actorId: userId,
      actorRole: "USER",
      type: "USER_UPDATED",
      message: "Order details updated by the developer",
      metadata: diff as unknown as Prisma.InputJsonValue,
    });
    return true;
  });
  if (!updated) {
    return { error: "Order is already being processed and can't be edited" };
  }

  refreshPaths();
  return { success: true };
}

"use server";

import type { WelcomePackOrderStatus } from "@prisma/client";
import dayjs from "dayjs";
import { revalidatePath } from "next/cache";
import { createElement } from "react";
import WelcomePackOrderApproved from "@/emails/WelcomePackOrderApproved";
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

function refreshAdminPaths() {
  revalidatePath("/dashboard/admin/welcome-pack");
  revalidatePath("/dashboard/welcome-pack");
}

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

  const pack = input.packId
    ? await prisma.welcomePack.update({
        where: { id: input.packId },
        data,
      })
    : await prisma.welcomePack.create({
        data: { ...data, currentWave: 1 },
      });

  refreshAdminPaths();
  return { success: true, packId: pack.id };
}

export type WelcomePackItemInput = {
  itemId?: string;
  packId: string;
  name: string;
  description?: string;
  requiresSize: boolean;
  sizeOptions: string[];
  displayOrder: number;
  isActive: boolean;
};

export async function saveWelcomePackItem(input: WelcomePackItemInput) {
  await requireAdmin();

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

  const data = {
    name: trimmedName,
    description: input.description?.trim() || null,
    requiresSize: input.requiresSize,
    sizeOptions,
    displayOrder: input.displayOrder,
    isActive: input.isActive,
  };

  const item = input.itemId
    ? await prisma.welcomePackItem.update({
        where: { id: input.itemId },
        data,
      })
    : await prisma.welcomePackItem.create({
        data: { ...data, packId: input.packId },
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

export async function approveWelcomePackOrder(orderId: string) {
  await requireAdmin();

  // CAS: only transition if still PENDING. Prevents double-emails when two
  // admins click Approve simultaneously.
  const result = await prisma.welcomePackOrder.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: { status: "APPROVED", approvedAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.welcomePackOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    return {
      error: exists
        ? `Order already ${exists.status.toLowerCase()}`
        : "Order not found",
    };
  }

  const order = await loadOrderForEmail(orderId);
  if (order) {
    try {
      const recipient = recipientFromOrder(order);
      if (recipient.email) {
        await sendEmail({
          to: recipient.email,
          subject: "Welcome Pack order approved",
          react: createElement(WelcomePackOrderApproved, {
            userName: recipient.name,
            idCardName: order.idCardName,
          }),
        });
      }
    } catch (error) {
      console.error("[welcome-pack] approval email failed:", error);
    }
  }

  refreshAdminPaths();
  return { success: true };
}

export async function rejectWelcomePackOrder(orderId: string, reason?: string) {
  await requireAdmin();

  const result = await prisma.welcomePackOrder.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: {
      status: "REJECTED",
      rejectionReason: reason?.trim() || null,
    },
  });
  if (result.count === 0) {
    const exists = await prisma.welcomePackOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    return {
      error: exists
        ? `Order already ${exists.status.toLowerCase()}`
        : "Order not found",
    };
  }

  const order = await loadOrderForEmail(orderId);
  if (order) {
    try {
      const recipient = recipientFromOrder(order);
      if (recipient.email) {
        await sendEmail({
          to: recipient.email,
          subject: "Welcome Pack order update",
          react: createElement(WelcomePackOrderRejected, {
            userName: recipient.name,
            reason: reason?.trim() || undefined,
          }),
        });
      }
    } catch (error) {
      console.error("[welcome-pack] rejection email failed:", error);
    }
  }

  refreshAdminPaths();
  return { success: true };
}

export async function markWelcomePackOrderShipped(
  orderId: string,
  trackingNumber: string,
  trackingUrl?: string,
) {
  await requireAdmin();

  const tracking = trackingNumber.trim();
  if (tracking.length === 0) {
    return { error: "Tracking number is required" };
  }

  const trackingUrlClean = trackingUrl?.trim() || null;

  const result = await prisma.welcomePackOrder.updateMany({
    where: { id: orderId, status: "APPROVED" },
    data: {
      status: "SHIPPED",
      shippedAt: new Date(),
      trackingNumber: tracking,
      trackingUrl: trackingUrlClean,
    },
  });
  if (result.count === 0) {
    const exists = await prisma.welcomePackOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    return {
      error: exists
        ? `Order is ${exists.status.toLowerCase()}, not approved — cannot mark shipped`
        : "Order not found",
    };
  }

  const order = await loadOrderForEmail(orderId);
  if (order) {
    try {
      const recipient = recipientFromOrder(order);
      if (recipient.email) {
        await sendEmail({
          to: recipient.email,
          subject: "Welcome Pack on the way",
          react: createElement(WelcomePackOrderShipped, {
            userName: recipient.name,
            trackingNumber: tracking,
            trackingUrl: trackingUrlClean,
          }),
        });
      }
    } catch (error) {
      console.error("[welcome-pack] shipped email failed:", error);
    }
  }

  refreshAdminPaths();
  return { success: true };
}

export async function markWelcomePackOrderDelivered(orderId: string) {
  await requireAdmin();

  const result = await prisma.welcomePackOrder.updateMany({
    where: { id: orderId, status: "SHIPPED" },
    data: { status: "DELIVERED", deliveredAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.welcomePackOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    return {
      error: exists
        ? `Order is ${exists.status.toLowerCase()}, not shipped`
        : "Order not found",
    };
  }

  refreshAdminPaths();
  return { success: true };
}

export type AdminOrderStatusFilter = WelcomePackOrderStatus | "ALL";

const LIVE_LOOKBACK_MONTHS = 6;
const LIVE_EVIDENCE_LIMIT = 10;

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

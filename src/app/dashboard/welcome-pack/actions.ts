"use server";

import { Prisma, type ShippingRegion } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { createElement } from "react";
import WelcomePackOrderSubmitted from "@/emails/WelcomePackOrderSubmitted";
import { getSession } from "@/lib/auth-utils";
import { sendEmail } from "@/lib/email";
import prisma from "@/lib/prisma";
import { assertEligibleForWelcomePack } from "@/lib/welcome-pack-eligibility";

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

const REQUIRED = (v: string | undefined, label: string) => {
  if (!v || v.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return v.trim();
};

export async function submitWelcomePackOrder(input: SubmitOrderInput) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  // Load pack and existing-order check in parallel — saves a round trip and
  // gives us `wave2Open` to feed into the eligibility check (avoiding a
  // duplicate `welcomePack.findFirst`).
  const [existing, pack] = await Promise.all([
    prisma.welcomePackOrder.findUnique({
      where: { userId },
      select: { id: true },
    }),
    prisma.welcomePack.findFirst({
      where: { isActive: true },
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
    return { error: "You already have a welcome pack order on file." };
  }
  if (!pack) {
    return { error: "Welcome pack is not configured yet." };
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

  const itemMap = new Map(pack.items.map((i) => [i.id, i]));

  let idCardName: string;
  let recipientName: string;
  let phone: string;
  let addressLine1: string;
  let city: string;
  let postalCode: string;
  let country: string;
  try {
    idCardName = REQUIRED(input.idCardName, "ID card name");
    recipientName = REQUIRED(input.recipientName, "Recipient name");
    phone = REQUIRED(input.phone, "Phone");
    addressLine1 = REQUIRED(input.addressLine1, "Address line 1");
    city = REQUIRED(input.city, "City");
    postalCode = REQUIRED(input.postalCode, "Postal code");
    country = REQUIRED(input.country, "Country");
  } catch (e) {
    return { error: (e as Error).message };
  }

  if (!["DOMESTIC", "INTERNATIONAL"].includes(input.region)) {
    return { error: "Invalid shipping region" };
  }

  if (input.region === "DOMESTIC" && country.toUpperCase() !== "MY") {
    return {
      error: "Domestic shipping is for Malaysia (MY) addresses only.",
    };
  }

  // Validate selections.
  const selections: { itemId: string; selectedSize?: string }[] = [];
  for (const item of pack.items) {
    const provided = input.selections.find((s) => s.itemId === item.id);
    if (item.requiresSize) {
      if (!provided?.selectedSize) {
        return { error: `Select a size for ${item.name}` };
      }
      if (!item.sizeOptions.includes(provided.selectedSize)) {
        return { error: `Invalid size for ${item.name}` };
      }
      selections.push({
        itemId: item.id,
        selectedSize: provided.selectedSize,
      });
    } else {
      // Always include non-sized items (curated by admin).
      selections.push({ itemId: item.id });
    }
  }

  // Drop any rogue selections referencing items that aren't in the pack.
  const filteredSelections = selections.filter((s) => itemMap.has(s.itemId));

  const orderData = {
    userId,
    packId: pack.id,
    wave,
    idCardName,
    region: input.region,
    recipientName,
    phone,
    addressLine1,
    addressLine2: input.addressLine2?.trim() || null,
    city,
    stateProvince: input.stateProvince?.trim() || null,
    postalCode,
    country: country.toUpperCase(),
    notes: input.notes?.trim() || null,
    eligibilitySnapshot:
      eligibilitySnapshot as unknown as Prisma.InputJsonValue,
    selections: {
      create: filteredSelections.map((s) => ({
        itemId: s.itemId,
        selectedSize: s.selectedSize ?? null,
      })),
    },
  };

  const orderInclude = {
    user: { include: { user: { select: { email: true, name: true } } } },
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
    // P2002 = unique constraint violation. Race between the existence check
    // and create — handled cleanly so the user sees a friendly message.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "You already have a welcome pack order on file." };
    }
    throw error;
  }

  // Notify admins.
  try {
    const admins = await prisma.userProfile.findMany({
      where: { role: "ADMIN" },
      include: { user: { select: { email: true } } },
    });
    const recipients = admins
      .map((a) => a.user.email)
      .filter((e): e is string => Boolean(e));

    if (recipients.length > 0) {
      const developerName =
        order.user.legalName ||
        order.user.user.name ||
        order.recipientName ||
        "Developer";
      await Promise.all(
        recipients.map((to) =>
          sendEmail({
            to,
            subject: `New Welcome Pack order — ${developerName}`,
            react: createElement(WelcomePackOrderSubmitted, {
              developerName,
              recipientName: order.recipientName,
              region: order.region,
              wave: order.wave,
              idCardName: order.idCardName,
            }),
          }),
        ),
      );
    }
  } catch (error) {
    console.error("[welcome-pack] admin notification failed:", error);
  }

  revalidatePath("/dashboard/welcome-pack");
  revalidatePath("/dashboard/admin/welcome-pack");
  return { success: true };
}

export async function cancelWelcomePackOrder() {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  const order = await prisma.welcomePackOrder.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (!order) return { error: "No order to cancel" };
  if (order.status !== "PENDING") {
    return {
      error: "Order is already being processed and cannot be cancelled",
    };
  }

  await prisma.welcomePackOrder.update({
    where: { id: order.id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/dashboard/welcome-pack");
  revalidatePath("/dashboard/admin/welcome-pack");
  return { success: true };
}

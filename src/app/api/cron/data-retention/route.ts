import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  daysAgo,
  WELCOME_PACK_ADDRESS_RETENTION_DAYS,
  WELCOME_PACK_TERMINAL_RETENTION_DAYS,
} from "@/lib/retention";
import { redactOrderEventMetadata } from "@/lib/welcome-pack-events";

/**
 * Data-retention sweep. Named generically so future sweeps (stale sessions,
 * email bodies, notification payloads) land here rather than accreting crons.
 *
 * Today it clears welcome-pack shipping PII once an order is settled: a name,
 * phone number and home address that were only ever needed to put a parcel in
 * someone's hands. Only DELIVERED / CANCELLED / REJECTED orders are touched —
 * never PENDING, APPROVED or SHIPPED, which are the states an admin still acts
 * on. Idempotent via addressPurgedAt, so a re-run is a no-op.
 *
 * Runs daily via Vercel Cron. Protected by CRON_SECRET.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const deliveredCutoff = daysAgo(WELCOME_PACK_ADDRESS_RETENTION_DAYS, now);
  const terminalCutoff = daysAgo(WELCOME_PACK_TERMINAL_RETENTION_DAYS, now);

  const due = await prisma.welcomePackOrder.findMany({
    where: {
      addressPurgedAt: null,
      OR: [
        { status: "DELIVERED", deliveredAt: { lt: deliveredCutoff } },
        {
          status: { in: ["CANCELLED", "REJECTED"] },
          updatedAt: { lt: terminalCutoff },
        },
      ],
    },
    select: { id: true, events: { select: { id: true, metadata: true } } },
  });

  let ordersPurged = 0;
  let eventsRedacted = 0;

  for (const order of due) {
    // Per-order try/catch so one bad row cannot abort the sweep, and one
    // transaction so a partial purge — cleared columns but an intact address
    // history in the audit trail — is impossible.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.welcomePackOrder.update({
          where: { id: order.id },
          data: {
            recipientName: null,
            phone: null,
            addressLine1: null,
            addressLine2: null,
            city: null,
            stateProvince: null,
            postalCode: null,
            taxId: null,
            addressPurgedAt: now,
          },
        });

        for (const event of order.events) {
          const redacted = redactOrderEventMetadata(event.metadata);
          if (JSON.stringify(redacted) === JSON.stringify(event.metadata)) {
            continue;
          }
          await tx.welcomePackOrderEvent.update({
            where: { id: event.id },
            data: { metadata: redacted as object },
          });
          eventsRedacted++;
        }
      });
      ordersPurged++;
    } catch (error) {
      console.error(
        `[data-retention] Failed to purge welcome pack order ${order.id}:`,
        error,
      );
    }
  }

  console.log(
    `[data-retention] Purged ${ordersPurged} welcome pack order(s), redacted ${eventsRedacted} event(s)`,
  );

  return NextResponse.json({ ordersPurged, eventsRedacted });
}

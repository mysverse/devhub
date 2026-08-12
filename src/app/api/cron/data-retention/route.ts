import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import prisma from "@/lib/prisma";
import {
  daysAgo,
  hoursAgo,
  PPT_ATTACHMENT_ORPHAN_CLAIM_RETENTION_HOURS,
  PPT_ATTACHMENT_UNPOSTED_RETENTION_HOURS,
  WELCOME_PACK_ADDRESS_RETENTION_DAYS,
  WELCOME_PACK_TERMINAL_RETENTION_DAYS,
} from "@/lib/retention";
import { redactOrderEventMetadata } from "@/lib/welcome-pack-events";

/**
 * Data-retention sweep. Named generically so future sweeps (stale sessions,
 * email bodies, notification payloads) land here rather than accreting crons.
 *
 * It clears welcome-pack shipping PII once an order is settled: a name, phone
 * number and home address that were only ever needed to put a parcel in
 * someone's hands. Only DELIVERED / CANCELLED / REJECTED orders are touched —
 * never PENDING, APPROVED or SHIPPED, which are the states an admin still acts
 * on. Idempotent via addressPurgedAt, so a re-run is a no-op.
 *
 * It also drops PPT comment attachments that were uploaded but never posted,
 * which is what a closed composer leaves behind.
 *
 * Runs daily via Vercel Cron. Protected by CRON_SECRET.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
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

  // Attachments no live comment points at. Dropping the row is the whole
  // cleanup — Linear's API has no delete for an uploaded asset, and an
  // unreferenced asset is unreachable without the URL we are discarding.
  //
  // Two shapes qualify:
  //   - UPLOADED: the uploader abandoned it (closed the composer). The bytes
  //     reached Linear but no comment ever referenced them.
  //   - POSTED with a null postedAt: the claim flipped the row before
  //     `createComment` returned and the invocation died, so the
  //     release-on-throw never ran. Unclaimable forever, since the
  //     compare-and-set only matches UPLOADED — and until collected it renders
  //     as evidence on the admin payout surface for a comment that does not
  //     exist. Given a much longer window because the same shape also occurs
  //     when the comment IS live and only the postedAt stamp failed.
  //
  // A POSTED row with postedAt set is never touched: that is the record of what
  // a live proof or progress comment points at.
  let attachmentsDiscarded = 0;
  try {
    const result = await prisma.pptCommentAttachment.deleteMany({
      where: {
        OR: [
          {
            status: "UPLOADED",
            createdAt: {
              lt: hoursAgo(PPT_ATTACHMENT_UNPOSTED_RETENTION_HOURS, now),
            },
          },
          {
            status: "POSTED",
            postedAt: null,
            createdAt: {
              lt: hoursAgo(PPT_ATTACHMENT_ORPHAN_CLAIM_RETENTION_HOURS, now),
            },
          },
        ],
      },
    });
    attachmentsDiscarded = result.count;
  } catch (error) {
    // Kept separate from the welcome-pack loop above so a failure in either
    // sweep still leaves the other's work committed and reported.
    console.error(
      "[data-retention] Failed to discard unposted PPT attachments:",
      error,
    );
  }

  console.log(
    `[data-retention] Discarded ${attachmentsDiscarded} unposted PPT attachment(s)`,
  );

  return NextResponse.json({
    ordersPurged,
    eventsRedacted,
    attachmentsDiscarded,
  });
}

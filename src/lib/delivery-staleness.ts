/**
 * When an existing delivery row means "leave it alone", shared by the email
 * layer (`EmailDelivery`) and the notification layer (`NotificationDelivery`).
 *
 * The two must agree. They are consulted one after the other on the same send,
 * so the stricter one silently wins: notifications used to treat any PENDING
 * row as in-flight forever, which meant a send whose invocation died mid-flight
 * — precisely what a transient Accelerate failure causes — left a row that
 * blocked every later attempt. The payment confirmation for a transaction that
 * was already PAID could then never be resent, by an admin or by anything else.
 *
 * Kept Prisma-free so it unit-tests without a DATABASE_URL.
 */

/**
 * How long a delivery may sit PENDING before a fresh attempt is allowed. Past
 * this the invocation that reserved it is presumed dead rather than in flight.
 */
export const STALE_PENDING_MS = 10 * 60 * 1000;

export type DeliveryState = {
  status: string;
  updatedAt: Date;
};

/**
 * True when the delivery is finished (SENT) or genuinely still being attempted
 * by someone else. False for FAILED, SKIPPED, and abandoned PENDING rows — all
 * of which a retry should be allowed to pick up.
 */
export function isDeliverySettled(
  delivery: DeliveryState,
  now: number = Date.now(),
): boolean {
  if (delivery.status === "SENT") return true;
  return (
    delivery.status === "PENDING" &&
    now - delivery.updatedAt.getTime() < STALE_PENDING_MS
  );
}

export type OrderingWindowPack = {
  orderingEnabled: boolean;
  ordersOpenAt: Date | null;
  ordersCloseAt: Date | null;
};

export type OrderingWindowState =
  | { open: true; opensAt: Date | null; closesAt: Date | null }
  | {
      open: false;
      reason: "disabled" | "not-yet-open" | "closed";
      opensAt: Date | null;
      closesAt: Date | null;
    };

/**
 * Whether the pack is currently accepting new orders. Pure so the user page,
 * the submit action, and the admin config panel all agree. Server callers
 * must pass server time (the default) — never client time.
 *
 * The manual toggle wins over the schedule; within the schedule, opensAt is
 * inclusive and closesAt is exclusive.
 */
export function getOrderingWindowState(
  pack: OrderingWindowPack,
  now: Date = new Date(),
): OrderingWindowState {
  const opensAt = pack.ordersOpenAt;
  const closesAt = pack.ordersCloseAt;

  if (!pack.orderingEnabled) {
    return { open: false, reason: "disabled", opensAt, closesAt };
  }
  if (opensAt && now < opensAt) {
    return { open: false, reason: "not-yet-open", opensAt, closesAt };
  }
  if (closesAt && now >= closesAt) {
    return { open: false, reason: "closed", opensAt, closesAt };
  }
  return { open: true, opensAt, closesAt };
}

/** User-facing copy for a closed window, shared by page and submit action. */
export function orderingClosedMessage(
  state: Extract<OrderingWindowState, { open: false }>,
): string {
  switch (state.reason) {
    case "disabled":
      return "Ordering is temporarily paused. Check back soon.";
    case "not-yet-open":
      return "Ordering hasn't opened yet.";
    case "closed":
      return "Ordering for this welcome pack has closed.";
  }
}

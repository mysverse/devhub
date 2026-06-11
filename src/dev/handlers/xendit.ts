/**
 * Mock Xendit disbursements (src/lib/xendit.ts). Stateful like the Billplz
 * mock: PENDING on first status read, COMPLETED on subsequent reads, so the
 * xendit-poll cron drives payouts to completion.
 */

import type { DevHandler } from "@/dev/intercept";
import { getDevState, type MockPaymentOrder } from "@/dev/state";

function disbursementResponse(order: MockPaymentOrder) {
  const payload = order.payload;
  return {
    id: order.id,
    external_id: payload.external_id ?? `mock-external-${order.id}`,
    amount: payload.amount ?? 50,
    bank_code: payload.bank_code ?? "CIMB",
    account_holder_name: payload.account_holder_name ?? "Mock Recipient",
    status: order.status,
    created: "2026-01-01T00:00:00.000Z",
    updated: new Date().toISOString(),
  };
}

export const handleXendit: DevHandler = async (req, url) => {
  if (url.pathname === "/v2/disbursements" && req.method === "POST") {
    const state = getDevState();
    const payload = (await req.json()) as Record<string, unknown>;
    const id = `mock-xendit-disb-${String(100 + ++state.counters.xendit)}`;
    const order: MockPaymentOrder = {
      id,
      status: "PENDING",
      reads: 0,
      payload,
    };
    state.xendit.set(id, order);
    return Response.json(disbursementResponse(order));
  }

  const match = /^\/v2\/disbursements\/([^/]+)$/.exec(url.pathname);
  if (match && req.method === "GET") {
    const { xendit } = getDevState();
    let order = xendit.get(match[1]);
    if (!order) {
      order = { id: match[1], status: "PENDING", reads: 0, payload: {} };
      xendit.set(order.id, order);
    }
    order.reads += 1;
    if (order.reads >= 2 && order.status === "PENDING") {
      order.status = "COMPLETED";
    }
    return Response.json(disbursementResponse(order));
  }

  throw new Error(
    `[dev-mode] Mock Xendit: unhandled ${req.method} ${url.pathname}. Add it in src/dev/handlers/xendit.ts`,
  );
};

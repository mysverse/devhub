/**
 * Mock Billplz V5 payment orders (src/lib/billplz.ts). Orders are stateful:
 * a status read returns "processing" first, then "completed" on subsequent
 * reads — so the billplz-poll cron drives payouts to completion. The seeded
 * payout's order id (src/dev/fixtures/payments.ts) is materialised lazily.
 */

import { BILLPLZ_MOCK_COLLECTION_ID } from "@/dev/fixtures/payments";
import type { DevHandler } from "@/dev/intercept";
import { getDevState, type MockPaymentOrder } from "@/dev/state";

function orderResponse(order: MockPaymentOrder) {
  const payload = order.payload;
  return {
    id: order.id,
    payment_order_collection_id:
      payload.payment_order_collection_id ?? BILLPLZ_MOCK_COLLECTION_ID,
    bank_code: payload.bank_code ?? "MBBEMYKL",
    bank_account_number: payload.bank_account_number ?? "512345678901",
    name: payload.name ?? "Mock Recipient",
    description: payload.description ?? "Mock payout",
    email: payload.email ?? "developer@devhub.mock",
    total: payload.total ?? 4000,
    status: order.status,
    notification: false,
    recipient_notification: false,
    reference_1: payload.reference_1 ?? null,
    reference_2: payload.reference_2 ?? null,
    created_at: "2026-01-01T00:00:00.000Z",
    processed_at:
      order.status === "completed" ? new Date().toISOString() : null,
  };
}

function getOrCreateOrder(id: string): MockPaymentOrder {
  const { billplz } = getDevState();
  let order = billplz.get(id);
  if (!order) {
    order = { id, status: "processing", reads: 0, payload: {} };
    billplz.set(id, order);
  }
  return order;
}

export const handleBillplz: DevHandler = async (req, url) => {
  if (url.pathname === "/api/v5/payment_orders" && req.method === "POST") {
    const state = getDevState();
    const payload = (await req.json()) as Record<string, unknown>;
    const id = `mock-billplz-po-${String(100 + ++state.counters.billplz)}`;
    const order: MockPaymentOrder = {
      id,
      status: "processing",
      reads: 0,
      payload,
    };
    state.billplz.set(id, order);
    return Response.json(orderResponse(order));
  }

  const orderMatch = /^\/api\/v5\/payment_orders\/([^/]+)$/.exec(url.pathname);
  if (orderMatch && req.method === "GET") {
    const order = getOrCreateOrder(orderMatch[1]);
    order.reads += 1;
    if (order.reads >= 2 && order.status === "processing") {
      order.status = "completed";
    }
    return Response.json(orderResponse(order));
  }

  if (
    url.pathname === "/api/v5/payment_order_collections" &&
    req.method === "POST"
  ) {
    const payload = (await req.json()) as { title?: string };
    return Response.json({
      id: BILLPLZ_MOCK_COLLECTION_ID,
      title: payload.title ?? "Mock Collection",
      status: "active",
    });
  }

  throw new Error(
    `[dev-mode] Mock Billplz: unhandled ${req.method} ${url.pathname}. Add it in src/dev/handlers/billplz.ts`,
  );
};

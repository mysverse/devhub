/**
 * Deterministic payment-provider ids shared by the seed script (Payout rows)
 * and the mock provider handler (src/dev/handlers/billplz.ts), so a
 * seeded PROCESSING payout can be polled/webhooked to completion.
 */

export const BILLPLZ_SEEDED_PAYMENT_ORDER_ID = "mock-billplz-po-001";

/** Collection id the mock Billplz handler reports and Redis caches. */
export const BILLPLZ_MOCK_COLLECTION_ID = "mock-billplz-collection";

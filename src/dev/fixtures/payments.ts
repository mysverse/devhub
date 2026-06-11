/**
 * Deterministic payment-provider ids shared by the seed script (Payout rows)
 * and the mock provider handlers (src/dev/handlers/{billplz,xendit}.ts), so a
 * seeded PROCESSING payout can be polled/webhooked to completion.
 */

export const BILLPLZ_SEEDED_PAYMENT_ORDER_ID = "mock-billplz-po-001";
export const XENDIT_SEEDED_DISBURSEMENT_ID = "mock-xendit-disb-001";

/** Collection id the mock Billplz handler reports and Redis caches. */
export const BILLPLZ_MOCK_COLLECTION_ID = "mock-billplz-collection";

/**
 * Xendit API client for disbursements (payouts).
 * Uses Basic Auth with API key as username, no password.
 * Amounts are in whole currency units (NOT cents).
 */

/**
 * Check if Xendit is configured and available.
 * Returns false if API key is not set — all Xendit operations will be skipped.
 */
export function isXenditEnabled(): boolean {
  return !!process.env.XENDIT_API_KEY;
}

function getApiKey(): string {
  const key = process.env.XENDIT_API_KEY;
  if (!key) throw new Error("XENDIT_API_KEY is not set");
  return key;
}

function getCallbackVerificationToken(): string {
  const token = process.env.XENDIT_CALLBACK_VERIFICATION_TOKEN;
  if (!token) throw new Error("XENDIT_CALLBACK_VERIFICATION_TOKEN is not set");
  return token;
}

const XENDIT_BASE_URL = "https://api.xendit.co";

function getAuthHeader(): string {
  return `Basic ${Buffer.from(`${getApiKey()}:`).toString("base64")}`;
}

// -- Types --

export interface CreateDisbursementParams {
  externalId: string;
  bankCode: string;
  accountHolderName: string;
  accountNumber: string;
  amount: number;
  description: string;
}

export interface DisbursementResponse {
  id: string;
  external_id: string;
  amount: number;
  bank_code: string;
  account_holder_name: string;
  status: string;
  failure_code?: string;
  created: string;
  updated: string;
}

// -- API Functions --

/**
 * Create a Xendit disbursement (payout to bank account).
 * Amount is in whole MYR (e.g. 50 for RM50), NOT cents.
 * Uses externalId as idempotency key — Xendit rejects duplicate externalIds.
 */
export async function createDisbursement(
  params: CreateDisbursementParams,
): Promise<DisbursementResponse> {
  const response = await fetch(`${XENDIT_BASE_URL}/v2/disbursements`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_id: params.externalId,
      bank_code: params.bankCode,
      account_holder_name: params.accountHolderName,
      account_number: params.accountNumber,
      amount: params.amount,
      description: params.description,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Xendit API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Get a Xendit disbursement by ID.
 */
export async function getDisbursement(
  disbursementId: string,
): Promise<DisbursementResponse> {
  const response = await fetch(
    `${XENDIT_BASE_URL}/v2/disbursements/${disbursementId}`,
    {
      method: "GET",
      headers: { Authorization: getAuthHeader() },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Xendit API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Verify the callback token from Xendit webhook.
 * Xendit sends an `x-callback-token` header that must match our configured token.
 */
export function verifyWebhookToken(receivedToken: string): boolean {
  return receivedToken === getCallbackVerificationToken();
}

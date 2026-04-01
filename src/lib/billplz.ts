import crypto from "node:crypto";
import { BILLPLZ_COLLECTION_ID_KEY, getKV } from "@/lib/redis";

const BILLPLZ_BASE_URL =
  process.env.BILLPLZ_SANDBOX === "true"
    ? "https://www.billplz-sandbox.com/api/v5"
    : "https://www.billplz.com/api/v5";

function getApiSecretKey(): string {
  const key = process.env.BILLPLZ_API_SECRET_KEY;
  if (!key) throw new Error("BILLPLZ_API_SECRET_KEY is not set");
  return key;
}

function getXSignatureKey(): string {
  const key = process.env.BILLPLZ_XSIGNATURE_KEY;
  if (!key) throw new Error("BILLPLZ_XSIGNATURE_KEY is not set");
  return key;
}

async function getCollectionId(): Promise<string> {
  const redisId = await getKV(BILLPLZ_COLLECTION_ID_KEY);
  if (redisId) return redisId;

  const envId = process.env.BILLPLZ_PAYMENT_ORDER_COLLECTION_ID;
  if (envId) return envId;

  throw new Error(
    "Billplz payment order collection ID not found in Redis or environment",
  );
}

function getAuthHeader(): string {
  return `Basic ${Buffer.from(`${getApiSecretKey()}:`).toString("base64")}`;
}

/**
 * Compute HMAC-SHA512 checksum for Billplz V5 API requests.
 * Per Billplz docs, values are concatenated directly with no separator.
 * e.g. "My payment order title1681724303"
 */
function computeChecksum(values: (string | number)[]): string {
  const data = values.join("");
  return crypto
    .createHmac("sha512", getXSignatureKey())
    .update(data)
    .digest("hex");
}

// -- Types --

export interface PaymentOrderParams {
  bankCode: string;
  bankAccountNumber: string;
  name: string;
  description: string;
  totalCents: number;
  reference1?: string;
  reference2?: string;
}

export interface PaymentOrderResponse {
  id: string;
  payment_order_collection_id: string;
  bank_code: string;
  bank_account_number: string;
  name: string;
  description: string;
  total: number;
  status: string;
  reference_1: string | null;
  reference_2: string | null;
  created_at: string;
  processed_at: string | null;
}

// -- API Functions --

/**
 * Create a Billplz V5 Payment Order (payout to bank account).
 */
export async function createPaymentOrder(
  params: PaymentOrderParams,
): Promise<PaymentOrderResponse> {
  const collectionId = await getCollectionId();
  const epoch = Math.floor(Date.now() / 1000);

  // Checksum order per Billplz V5 docs:
  // [ payment_order_collection_id, bank_account_number, total, epoch ]
  const checksumValues: (string | number)[] = [
    collectionId,
    params.bankAccountNumber,
    params.totalCents,
    epoch,
  ];

  const checksum = computeChecksum(checksumValues);

  const body: Record<string, string | number> = {
    payment_order_collection_id: collectionId,
    bank_code: params.bankCode,
    bank_account_number: params.bankAccountNumber,
    name: params.name,
    description: params.description,
    total: params.totalCents,
    epoch,
    checksum,
  };
  if (params.reference1) body.reference_1 = params.reference1;
  if (params.reference2) body.reference_2 = params.reference2;

  const response = await fetch(`${BILLPLZ_BASE_URL}/payment_orders`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Billplz API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Get a Billplz V5 Payment Order by ID.
 */
export async function getPaymentOrder(
  paymentOrderId: string,
): Promise<PaymentOrderResponse> {
  const epoch = Math.floor(Date.now() / 1000);
  const checksum = computeChecksum([paymentOrderId, epoch]);

  const url = new URL(`${BILLPLZ_BASE_URL}/payment_orders/${paymentOrderId}`);
  url.searchParams.set("epoch", String(epoch));
  url.searchParams.set("checksum", checksum);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: getAuthHeader() },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Billplz API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

// -- Collection Types --

export interface PaymentOrderCollectionResponse {
  id: string;
  title: string;
  status: string;
}

/**
 * Create a Billplz V5 Payment Order Collection.
 * Allows setting the callback URL which cannot be configured via the Billplz dashboard.
 */
export async function createPaymentOrderCollection(params: {
  title: string;
  callbackUrl?: string;
}): Promise<PaymentOrderCollectionResponse> {
  const epoch = Math.floor(Date.now() / 1000);

  // Checksum order per Billplz V5 docs: [ title, callback_url*, epoch ]
  // Optional values (marked with *) are only included when provided
  const checksumValues: (string | number)[] = [params.title];
  if (params.callbackUrl) checksumValues.push(params.callbackUrl);
  checksumValues.push(epoch);

  const checksum = computeChecksum(checksumValues);

  const body: Record<string, string | number> = {
    title: params.title,
    epoch,
    checksum,
  };
  if (params.callbackUrl) body.callback_url = params.callbackUrl;

  const response = await fetch(
    `${BILLPLZ_BASE_URL}/payment_order_collections`,
    {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Billplz API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Verify callback signature from Billplz webhook.
 * Billplz sends x_signature as part of the POST body.
 * The signature is computed over all other fields sorted alphabetically, joined by `|`.
 */
export function verifyCallbackSignature(
  params: Record<string, string>,
  receivedSignature: string,
): boolean {
  const keys = Object.keys(params)
    .filter((k) => k !== "x_signature")
    .sort();
  const data = keys.map((k) => `${k}${params[k]}`).join("|");
  const expectedSignature = crypto
    .createHmac("sha512", getXSignatureKey())
    .update(data)
    .digest("hex");
  return expectedSignature === receivedSignature;
}

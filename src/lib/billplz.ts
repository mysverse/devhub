import crypto from "node:crypto";

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

function getCollectionId(): string {
  const id = process.env.BILLPLZ_PAYMENT_ORDER_COLLECTION_ID;
  if (!id) throw new Error("BILLPLZ_PAYMENT_ORDER_COLLECTION_ID is not set");
  return id;
}

function getAuthHeader(): string {
  return `Basic ${Buffer.from(`${getApiSecretKey()}:`).toString("base64")}`;
}

/**
 * Compute HMAC-SHA512 checksum for Billplz V5 API requests.
 * Values are joined with `|` pipe separator.
 */
function computeChecksum(values: (string | number)[]): string {
  const data = values.join("|");
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
  const collectionId = getCollectionId();
  const epoch = Math.floor(Date.now() / 1000);

  // Build checksum values in order:
  // payment_order_collection_id, bank_code, bank_account_number, name, description, total, [reference_1], [reference_2], epoch
  const checksumValues: (string | number)[] = [
    collectionId,
    params.bankCode,
    params.bankAccountNumber,
    params.name,
    params.description,
    params.totalCents,
  ];
  if (params.reference1) checksumValues.push(params.reference1);
  if (params.reference2) checksumValues.push(params.reference2);
  checksumValues.push(epoch);

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

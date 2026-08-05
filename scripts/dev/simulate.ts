/**
 * Dev-mode event simulators. Signs payloads with the committed fake secrets
 * from .env.mock, so the REAL webhook verification and cron auth code paths
 * run unchanged against `pnpm dev:mock`.
 *
 *   pnpm simulate linear --issue MYS-201 --action complete|reopen|cancel|comment
 *   pnpm simulate billplz [--id <providerPayoutId>|--latest] [--status completed|failed]
 *   pnpm simulate xendit  [--id <disbursementId>|--latest] [--status COMPLETED|FAILED]
 *   pnpm simulate cron <billplz-poll|xendit-poll|kyc-cleanup|incentives-weekly|
 *                       incentives-release|ppt-admin-digest|ppt-eligibility|
 *                       ppt-assignment-watch|data-retention>
 */

import crypto from "node:crypto";
import { config } from "dotenv";

config({ path: ".env.mock", override: true, quiet: true });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing from .env.mock`);
  return value;
}

async function logResponse(label: string, res: Response) {
  console.log(`[simulate] ${label} → HTTP ${res.status}`);
  const text = await res.text();
  if (text) console.log(`[simulate] response: ${text.slice(0, 500)}`);
  if (!res.ok) process.exit(1);
}

// ── Linear ────────────────────────────────────────────────────────────────────

async function simulateLinear() {
  const identifier = arg("issue") ?? "MYS-201";
  const action = arg("action") ?? "complete";

  // Mutate the server's in-memory mock workspace first so the webhook
  // handler's follow-up Linear API fetches agree with the event.
  const mutate = await fetch(`${BASE_URL}/api/dev/linear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier,
      action,
      body: arg("body") ?? undefined,
    }),
  });
  if (!mutate.ok) {
    throw new Error(
      `Mock mutation failed: HTTP ${mutate.status} ${await mutate.text()}`,
    );
  }
  const { type, data } = (await mutate.json()) as {
    type: "Issue" | "Comment";
    data: Record<string, unknown>;
  };

  const payload = JSON.stringify({
    action: "update",
    type,
    data,
    updatedFrom: {},
    createdAt: new Date().toISOString(),
    organizationId: "mock-org",
    webhookId: "mock-webhook",
  });
  const signature = crypto
    .createHmac("sha256", requireEnv("LINEAR_WEBHOOK_SECRET"))
    .update(payload)
    .digest("hex");

  const res = await fetch(`${BASE_URL}/api/webhooks/linear`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "linear-signature": signature,
    },
    body: payload,
  });
  await logResponse(`linear ${action} ${identifier}`, res);
}

// ── Payout providers ──────────────────────────────────────────────────────────

async function latestProcessingPayout(provider: "BILLPLZ" | "XENDIT") {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: requireEnv("DATABASE_URL") });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT "providerPayoutId" FROM "Payout"
       WHERE provider = $1 AND status = 'PROCESSING' AND "providerPayoutId" IS NOT NULL
       ORDER BY "createdAt" DESC LIMIT 1`,
      [provider],
    );
    const id = result.rows[0]?.providerPayoutId as string | undefined;
    if (!id) {
      throw new Error(
        `No PROCESSING ${provider} payout found — seed one with pnpm dev:mock:reset or trigger an auto-payout first`,
      );
    }
    return id;
  } finally {
    await client.end();
  }
}

async function simulateBillplz() {
  const id = arg("id") ?? (await latestProcessingPayout("BILLPLZ"));
  const status = arg("status") ?? "completed";

  const params: Record<string, string> = { id, status };
  if (status === "failed") params.error_message = "Simulated failure";
  const data = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("|");
  params.x_signature = crypto
    .createHmac("sha512", requireEnv("BILLPLZ_XSIGNATURE_KEY"))
    .update(data)
    .digest("hex");

  const res = await fetch(`${BASE_URL}/api/webhooks/billplz`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  await logResponse(`billplz ${status} ${id}`, res);
}

async function simulateXendit() {
  const id = arg("id") ?? (await latestProcessingPayout("XENDIT"));
  const status = arg("status") ?? "COMPLETED";

  const res = await fetch(`${BASE_URL}/api/webhooks/xendit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-callback-token": requireEnv("XENDIT_CALLBACK_VERIFICATION_TOKEN"),
    },
    body: JSON.stringify({
      id,
      status,
      ...(status === "FAILED" ? { failure_code: "SIMULATED_FAILURE" } : {}),
    }),
  });
  await logResponse(`xendit ${status} ${id}`, res);
}

// ── Crons ─────────────────────────────────────────────────────────────────────

const CRON_ROUTES = [
  "billplz-poll",
  "xendit-poll",
  "kyc-cleanup",
  "incentives-weekly",
  "incentives-release",
  "ppt-admin-digest",
  "ppt-eligibility",
  "ppt-assignment-watch",
  "data-retention",
];

async function simulateCron(name: string | undefined) {
  if (!name || !CRON_ROUTES.includes(name)) {
    throw new Error(`Usage: pnpm simulate cron <${CRON_ROUTES.join("|")}>`);
  }
  const res = await fetch(`${BASE_URL}/api/cron/${name}`, {
    headers: { Authorization: `Bearer ${requireEnv("CRON_SECRET")}` },
  });
  await logResponse(`cron ${name}`, res);
}

// ── Entry ─────────────────────────────────────────────────────────────────────

async function main() {
  const command = process.argv[2];
  switch (command) {
    case "linear":
      return simulateLinear();
    case "billplz":
      return simulateBillplz();
    case "xendit":
      return simulateXendit();
    case "cron":
      return simulateCron(process.argv[3]);
    default:
      console.error(
        "Usage: pnpm simulate <linear|billplz|xendit|cron> [options]\n" +
          "  linear  --issue MYS-201 --action complete|reopen|cancel|comment [--body ...]\n" +
          "  billplz [--id <providerPayoutId>] [--status completed|failed]\n" +
          "  xendit  [--id <disbursementId>] [--status COMPLETED|FAILED]\n" +
          `  cron    <${CRON_ROUTES.join("|")}>`,
      );
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

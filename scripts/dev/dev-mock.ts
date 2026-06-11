/**
 * Dev mode ("mock mode") orchestrator — run via `pnpm dev:mock`.
 *
 *   pnpm dev:mock          boot DB + schema + seed (first run) + next dev
 *   pnpm dev:mock --reset  wipe the local DB, re-push schema, re-seed
 *   pnpm dev:mock --seed-only  everything except starting next dev
 *   pnpm dev:mock --stop   stop the local prisma-dev server
 *
 * Loads .env.mock with override so values in .env/.env.local can never leak
 * into a mock run, then drives the embedded `prisma dev` Postgres server
 * (name: devhub-mock). The actual TCP URL is captured from the CLI output at
 * boot rather than trusting pinned ports (the CLI ignores --db-port).
 */

import { spawn, spawnSync } from "node:child_process";
import { config } from "dotenv";
import { Client } from "pg";

const SERVER_NAME = "devhub-mock";

function run(
  command: string,
  args: string[],
  opts: { capture?: boolean } = {},
): { status: number; output: string } {
  const result = spawnSync(command, args, {
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

async function waitForDatabase(url: string, timeoutMs = 30_000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(
    `[dev-mock] Database at ${url} not ready after ${timeoutMs}ms: ${lastError}`,
  );
}

async function isDatabaseSeeded(url: string): Promise<boolean> {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const result = await client.query(
      'SELECT count(*)::int AS count FROM "User"',
    );
    return result.rows[0].count > 0;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const reset = args.has("--reset");
  const seedOnly = args.has("--seed-only");
  const stop = args.has("--stop");

  config({ path: ".env.mock", override: true, quiet: true });
  const { assertDevModeSafety } = await import("@/lib/dev-mode");

  if (stop) {
    run("pnpm", ["exec", "prisma", "dev", "stop", SERVER_NAME]);
    if (reset) {
      run("pnpm", ["exec", "prisma", "dev", "rm", SERVER_NAME, "--force"]);
    }
    return;
  }

  console.log(`[dev-mock] Starting local Prisma Postgres (${SERVER_NAME})...`);
  // Idempotent: creates the server if missing, starts it if stopped, no-ops
  // if running — and always prints the TCP connection URL.
  const dev = run(
    "pnpm",
    ["exec", "prisma", "dev", "--name", SERVER_NAME, "--detach"],
    { capture: true },
  );
  const tcpUrl = dev.output.match(/postgres:\/\/\S+/)?.[0];
  if (dev.status !== 0 || !tcpUrl) {
    throw new Error(
      `[dev-mock] Could not start prisma dev server (exit ${dev.status}):\n${dev.output}`,
    );
  }
  process.env.DATABASE_URL = tcpUrl;
  process.env.DIRECT_DATABASE_URL = tcpUrl;

  assertDevModeSafety();

  await waitForDatabase(tcpUrl);
  console.log(`[dev-mock] Database ready at ${tcpUrl}`);

  const pushArgs = ["exec", "prisma", "db", "push"];
  if (reset) {
    pushArgs.push("--force-reset");
    console.log("[dev-mock] Resetting database (--reset)...");
  }
  if (run("pnpm", pushArgs).status !== 0) {
    throw new Error("[dev-mock] prisma db push failed");
  }

  if (run("pnpm", ["exec", "prisma", "generate"]).status !== 0) {
    throw new Error("[dev-mock] prisma generate failed");
  }

  if (reset || !(await isDatabaseSeeded(tcpUrl))) {
    console.log("[dev-mock] Seeding database...");
    if (run("pnpm", ["exec", "tsx", "prisma/seed.ts"]).status !== 0) {
      throw new Error("[dev-mock] Seed failed");
    }
  } else {
    console.log(
      "[dev-mock] Database already seeded — keeping existing data (use --reset for a fresh start)",
    );
  }

  if (seedOnly) {
    console.log("[dev-mock] --seed-only: done.");
    return;
  }

  console.log("[dev-mock] Starting next dev...");
  const next = spawn("pnpm", ["exec", "next", "dev"], {
    stdio: "inherit",
    env: process.env,
  });
  const forward = (signal: NodeJS.Signals) => () => next.kill(signal);
  process.on("SIGINT", forward("SIGINT"));
  process.on("SIGTERM", forward("SIGTERM"));
  next.on("exit", (code) => {
    // The prisma dev server stays running detached for fast warm boots;
    // `pnpm dev:mock:stop` shuts it down.
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

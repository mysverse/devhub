/**
 * Dev mode ("mock mode") flag contract.
 *
 * - `DEV_MODE` (server-only) gates all dev-mode logic: fetch interception,
 *   dev-only routes, the email/password auth provider, and seeding.
 * - `NEXT_PUBLIC_DEV_MODE` gates UI only (banner, sign-in persona buttons).
 *
 * Both flags live exclusively in `.env.mock`, loaded by `pnpm dev:mock`
 * (scripts/dev/dev-mock.ts). Never put them in `.env` or `.env.local`.
 */

/**
 * The only BETTER_AUTH_SECRET dev mode will accept. Committed on purpose:
 * matching it proves the process was launched from `.env.mock` rather than a
 * half-mock environment mixing real secrets with a mock database.
 */
export const MOCK_BETTER_AUTH_SECRET =
  "devhub-mock-better-auth-secret-do-not-use-in-prod";

/** Password shared by all seeded dev personas (see src/dev/fixtures/personas.ts). */
export const DEV_PASSWORD = "devhub-mock-password";

export function isDevMode(): boolean {
  return process.env.DEV_MODE === "true";
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Refuses to run dev mode against anything real. Called from
 * instrumentation, the dev:mock orchestrator, the seed script, and the
 * simulate/smoke scripts — anywhere dev mode is about to touch a database.
 */
export function assertDevModeSafety(): void {
  if (!isDevMode()) {
    throw new Error(
      "[dev-mode] assertDevModeSafety() called without DEV_MODE=true. " +
        "Dev-mode entrypoints must load .env.mock first (use `pnpm dev:mock`).",
    );
  }

  const problems: string[] = [];

  if (process.env.NODE_ENV === "production") {
    problems.push("NODE_ENV is 'production'");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    problems.push("DATABASE_URL is not set");
  } else if (!isLocalUrl(databaseUrl)) {
    problems.push(
      `DATABASE_URL points at a non-local host (${safeHost(databaseUrl)})`,
    );
  }

  const directUrl = process.env.DIRECT_DATABASE_URL;
  if (directUrl && !isLocalUrl(directUrl)) {
    problems.push(
      `DIRECT_DATABASE_URL points at a non-local host (${safeHost(directUrl)})`,
    );
  }

  if (process.env.BETTER_AUTH_SECRET !== MOCK_BETTER_AUTH_SECRET) {
    problems.push(
      "BETTER_AUTH_SECRET is not the committed mock value from .env.mock",
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `[dev-mode] Refusing to run with DEV_MODE=true:\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\nDev mode must only run via \`pnpm dev:mock\` against the local ` +
        `prisma-dev database. Check for real values leaking from .env/.env.local.`,
    );
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "<unparseable>";
  }
}

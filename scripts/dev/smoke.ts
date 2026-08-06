/**
 * Dev-mode smoke test: logs in as each persona and fetches every key route,
 * asserting HTTP 200 and the absence of Next.js error markers. The cheapest
 * end-to-end drift alarm — run it (`pnpm smoke`) after schema or page
 * changes while `pnpm dev:mock` is running.
 */

import { config } from "dotenv";

config({ path: ".env.mock", override: true, quiet: true });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/policy/aml-kyc",
  "/policy/asset-rights",
  "/policy/payment-flow",
];

const ROUTES_BY_PERSONA: Record<string, string[]> = {
  developer: [
    "/dashboard",
    "/dashboard/ppts",
    "/dashboard/transactions",
    "/dashboard/bonuses",
    "/dashboard/help",
    "/dashboard/documents",
    "/dashboard/documents/NDA",
    "/dashboard/documents/COI",
    "/dashboard/settings",
    "/dashboard/welcome-pack",
    "/dashboard/notifications",
    "/api/notifications",
  ],
  admin: [
    "/dashboard",
    "/dashboard/admin",
    "/dashboard/admin/users",
    "/dashboard/admin/kyc",
    "/dashboard/admin/access",
    "/dashboard/admin/documents",
    "/dashboard/admin/welcome-pack",
    "/dashboard/admin/campaigns",
    "/dashboard/notifications",
  ],
  fresh: ["/onboarding"],
};

const ERROR_MARKERS = [
  "Application error: a client-side exception",
  "Application error: a server-side exception",
  "Could not load assigned tasks",
  "Internal Server Error",
];

async function loginAs(persona: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/dev/login?as=${persona}`, {
    redirect: "manual",
  });
  if (res.status !== 303) {
    throw new Error(`Login as ${persona} failed: HTTP ${res.status}`);
  }
  const cookies = res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0]);
  if (cookies.length === 0) {
    throw new Error(`Login as ${persona} returned no session cookies`);
  }
  return cookies.join("; ");
}

async function checkRoute(
  route: string,
  cookie: string | null,
): Promise<string | null> {
  const res = await fetch(`${BASE_URL}${route}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  if (res.status !== 200) {
    return `HTTP ${res.status}${res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""}`;
  }
  const body = await res.text();
  for (const marker of ERROR_MARKERS) {
    if (body.includes(marker)) return `error marker: "${marker}"`;
  }
  return null;
}

/**
 * The fetch interceptor installs once at boot; if src/dev/** was edited since
 * (HMR doesn't reliably reload it), requests can silently reach real APIs.
 * Fail fast with a clear remedy instead of producing confusing route errors.
 */
async function assertInterceptorAlive() {
  const res = await fetch(`${BASE_URL}/api/dev/debug`);
  if (res.status !== 200) {
    throw new Error(
      `GET /api/dev/debug returned ${res.status} — is \`pnpm dev:mock\` running?`,
    );
  }
  const { probe } = (await res.json()) as { probe: string };
  if (!probe.includes("mock-linear-access-token")) {
    throw new Error(
      `Fetch interceptor is NOT intercepting (probe: ${probe.slice(0, 80)}). ` +
        `Restart \`pnpm dev:mock\` — required after editing src/dev/** or src/instrumentation.ts.`,
    );
  }
}

async function main() {
  const failures: string[] = [];
  let checked = 0;

  const report = async (
    label: string,
    route: string,
    cookie: string | null,
  ) => {
    checked++;
    const problem = await checkRoute(route, cookie);
    if (problem) {
      failures.push(`[${label}] ${route} — ${problem}`);
      console.log(`  ✗ [${label}] ${route} — ${problem}`);
    } else {
      console.log(`  ✓ [${label}] ${route}`);
    }
  };

  console.log(`Smoke-testing ${BASE_URL} ...`);
  await assertInterceptorAlive();
  for (const route of PUBLIC_ROUTES) {
    await report("public", route, null);
  }
  for (const [persona, routes] of Object.entries(ROUTES_BY_PERSONA)) {
    const cookie = await loginAs(persona);
    for (const route of routes) {
      await report(persona, route, cookie);
    }
  }

  console.log(`\n${checked - failures.length}/${checked} routes OK`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s):`);
    for (const failure of failures) {
      console.error(`  ${failure}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The cron drift contract, enforced instead of documented.
 *
 * AGENTS.md requires a new cron route to be added in three places: the
 * directory under src/app/api/cron, the `crons` array in vercel.json, and
 * CRON_ROUTES in scripts/dev/simulate.ts. Miss the second and the job simply
 * never runs in production — silently, because the route still answers when
 * you curl it. Miss the third and it cannot be exercised in dev mode, so it is
 * the one path nobody tests.
 */

const ROOT = process.cwd();

function routeDirectories(): string[] {
  return readdirSync(join(ROOT, "src", "app", "api", "cron"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function vercelCronPaths(): string[] {
  const config = JSON.parse(
    readFileSync(join(ROOT, "vercel.json"), "utf8"),
  ) as { crons?: { path: string; schedule: string }[] };
  return (config.crons ?? [])
    .map((cron) => cron.path.replace("/api/cron/", ""))
    .sort();
}

function simulateCronRoutes(): string[] {
  const source = readFileSync(
    join(ROOT, "scripts", "dev", "simulate.ts"),
    "utf8",
  );
  const block = /const CRON_ROUTES = \[([\s\S]*?)\];/.exec(source);
  assert.ok(block, "CRON_ROUTES not found in scripts/dev/simulate.ts");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
}

test("the cron inventory is not vacuous", () => {
  // Guards the readers themselves: a broken path would make every assertion
  // below pass against three empty lists.
  assert.ok(
    routeDirectories().length >= 10,
    `expected the repo's cron routes, found ${routeDirectories().length}`,
  );
});

test("every cron route is scheduled in vercel.json", () => {
  assert.deepEqual(
    routeDirectories(),
    vercelCronPaths(),
    "a route with no vercel.json entry never runs in production; an entry with no route 404s every hour",
  );
});

test("every cron route can be simulated in dev mode", () => {
  assert.deepEqual(
    routeDirectories(),
    simulateCronRoutes(),
    "add the route to CRON_ROUTES in scripts/dev/simulate.ts (AGENTS.md drift contract)",
  );
});

test("every cron route checks its authorization", () => {
  // The !cronSecret half is what stops an unset secret making these public.
  const offenders = routeDirectories().filter((name) => {
    const source = readFileSync(
      join(ROOT, "src", "app", "api", "cron", name, "route.ts"),
      "utf8",
    );
    return !source.includes("isAuthorizedCronRequest(req)");
  });

  assert.deepEqual(
    offenders,
    [],
    `cron route(s) missing the CRON_SECRET check: ${offenders.join(", ")}`,
  );
});

/**
 * Visual layout verification: drives a real Chromium against a running
 * `pnpm dev:mock` server, screenshots every key page at several viewport
 * widths, and asserts two structural invariants that catch the classic
 * "looked fine on my screen" breakages:
 *
 *   1. No horizontal page overflow (document wider than the viewport).
 *   2. The fixed-height app header fully contains its visible children —
 *      nav items wrapping onto a second row (e.g. after adding a nav link)
 *      fail here.
 *
 * Screenshots land in screenshots/ (gitignored) for eyeballing; the process
 * exits non-zero on any violation, so it doubles as a CI-able check.
 *
 * Usage:
 *   pnpm dev:mock                        # in another terminal
 *   pnpm exec playwright install chromium # once
 *   pnpm visual                          # all personas/pages/viewports
 *   pnpm visual /dashboard/ppts          # only routes matching a prefix
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { type Browser, chromium, type Page } from "playwright";

config({ path: ".env.mock", override: true, quiet: true });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "screenshots");
const ROUTE_FILTER = process.argv[2] ?? null;

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
];

// Admin gets the widest nav (extra Admin link) — the worst case for header
// overflow — so admin covers the dashboard shell pages too.
const ROUTES_BY_PERSONA: Record<string, string[]> = {
  developer: [
    "/dashboard",
    "/dashboard/ppts",
    "/dashboard/ppts/ideas",
    "/dashboard/transactions",
    "/dashboard/bonuses",
    "/dashboard/help",
    "/dashboard/settings",
    "/dashboard/documents",
    "/dashboard/welcome-pack",
    "/dashboard/notifications",
  ],
  admin: ["/dashboard", "/dashboard/admin"],
  fresh: ["/onboarding"],
};

type Violation = {
  page: string;
  viewport: string;
  problem: string;
};

async function collectLayoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];

    const overflowX = document.documentElement.scrollWidth - window.innerWidth;
    if (overflowX > 1) {
      problems.push(`page overflows horizontally by ${overflowX}px`);
    }

    const header = document.querySelector("header");
    if (header) {
      const headerRect = header.getBoundingClientRect();
      for (const element of header.querySelectorAll<HTMLElement>("*")) {
        const style = window.getComputedStyle(element);
        // Skip non-rendered and intentionally-overlaying elements (open
        // dropdowns/popovers portal out of the header anyway).
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.position === "fixed" ||
          style.position === "absolute"
        ) {
          continue;
        }
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.bottom - headerRect.bottom > 2) {
          const label =
            element.textContent?.trim().slice(0, 40) ||
            element.tagName.toLowerCase();
          problems.push(
            `header content wraps below the header bar (${Math.round(rect.bottom - headerRect.bottom)}px past): "${label}"`,
          );
          break; // one wrap report per page is enough
        }
        if (rect.right - headerRect.right > 2) {
          const label =
            element.textContent?.trim().slice(0, 40) ||
            element.tagName.toLowerCase();
          problems.push(
            `header content overflows right edge (${Math.round(rect.right - headerRect.right)}px past): "${label}"`,
          );
          break;
        }
      }
    }

    return problems;
  });
}

async function verifyPersona(
  browser: Browser,
  persona: string,
  routes: string[],
  violations: Violation[],
) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: "reduce",
      colorScheme: "dark",
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/api/dev/login?as=${persona}`, {
      waitUntil: "load",
      timeout: 60_000,
    });

    for (const route of routes) {
      if (ROUTE_FILTER && !route.startsWith(ROUTE_FILTER)) continue;
      const label = `[${persona}] ${route} @ ${viewport.name}`;
      try {
        await page.goto(`${BASE_URL}${route}`, {
          waitUntil: "load",
          timeout: 60_000,
        });
        // Let streamed Suspense content and entrance transitions settle.
        await page.waitForTimeout(1500);

        const problems = await collectLayoutProblems(page);

        const fileName = `${persona}${route.replaceAll("/", "-")}-${viewport.name}.png`;
        await page.screenshot({
          path: path.join(OUT_DIR, fileName),
          fullPage: true,
        });

        if (problems.length > 0) {
          for (const problem of problems) {
            violations.push({
              page: `[${persona}] ${route}`,
              viewport: viewport.name,
              problem,
            });
          }
          console.log(`  ✗ ${label} — ${problems.join("; ")}`);
        } else {
          console.log(`  ✓ ${label}`);
        }
      } catch (error) {
        const problem =
          error instanceof Error ? error.message.split("\n")[0] : String(error);
        violations.push({
          page: `[${persona}] ${route}`,
          viewport: viewport.name,
          problem,
        });
        console.log(`  ✗ ${label} — ${problem}`);
      }
    }

    await context.close();
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Fail fast with a clear remedy when the server isn't up.
  try {
    await fetch(`${BASE_URL}/api/dev/debug`);
  } catch {
    console.error(
      `Cannot reach ${BASE_URL} — start \`pnpm dev:mock\` in another terminal first.`,
    );
    process.exit(1);
  }

  let browser: Browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    console.error(
      "Chromium is not installed for Playwright. Run: pnpm exec playwright install chromium",
    );
    console.error(
      error instanceof Error ? error.message.split("\n")[0] : error,
    );
    process.exit(1);
  }

  console.log(`Visual verification against ${BASE_URL} ...`);
  const violations: Violation[] = [];
  for (const [persona, routes] of Object.entries(ROUTES_BY_PERSONA)) {
    await verifyPersona(browser, persona, routes, violations);
  }
  await browser.close();

  console.log(
    `\nScreenshots written to ${path.relative(process.cwd(), OUT_DIR)}/`,
  );
  if (violations.length > 0) {
    console.error(`\n${violations.length} layout violation(s):`);
    for (const violation of violations) {
      console.error(
        `  ${violation.page} @ ${violation.viewport} — ${violation.problem}`,
      );
    }
    process.exit(1);
  }
  console.log("All pages pass the layout checks.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

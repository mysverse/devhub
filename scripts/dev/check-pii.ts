/**
 * Fails the build on PII regressions. Thin CLI over src/lib/pii-rules.ts,
 * mirroring the linear:validate split so the rules stay unit-testable (the
 * test glob is src/**\/*.test.ts and cannot reach scripts/).
 *
 * Run via `pnpm check` or directly with `pnpm check-pii`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  allowlistHitsFor,
  checkPiiRules,
  formatPiiViolations,
  PII_ALLOWLIST,
  type PiiAllowEntry,
  type PiiViolation,
} from "../../src/lib/pii-rules";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      // Test files carry the anti-patterns as fixtures on purpose, and none of
      // them ship. src/lib/action-guard-inventory.test.ts covers real modules.
      out.push(full);
    }
  }
  return out;
}

function main() {
  console.log("🔍 Checking PII invariants...");

  const files = walk(SRC);
  const violations: PiiViolation[] = [];
  const usedAllowlist = new Set<PiiAllowEntry>();

  for (const absolute of files) {
    const file = relative(ROOT, absolute).split("\\").join("/");
    const source = readFileSync(absolute, "utf8");
    violations.push(...checkPiiRules(file, source));
    for (const entry of allowlistHitsFor(file, source))
      usedAllowlist.add(entry);
  }

  const stale = PII_ALLOWLIST.filter((entry) => !usedAllowlist.has(entry));

  if (violations.length > 0) {
    console.error(`\n❌ ${violations.length} PII violation(s):\n`);
    console.error(formatPiiViolations(violations));
    console.error(
      "\nSuppress a legitimate case with `// pii-allow: <rule> — <reason>` or add\n" +
        "a file entry to PII_ALLOWLIST in src/lib/pii-rules.ts (a reason is required).\n",
    );
    process.exit(1);
  }

  if (stale.length > 0) {
    console.error(
      `\n❌ ${stale.length} stale allowlist entr${stale.length === 1 ? "y" : "ies"} — the code they excused is gone:\n`,
    );
    for (const entry of stale) {
      console.error(`   ${entry.file}  [${entry.rule}]\n     ${entry.reason}`);
    }
    console.error(
      "\nRemove them from PII_ALLOWLIST in src/lib/pii-rules.ts.\n",
    );
    process.exit(1);
  }

  console.log(
    `✅ ${files.length} file(s) checked, ${PII_ALLOWLIST.length} allowlist entr${PII_ALLOWLIST.length === 1 ? "y" : "ies"} all still in use.`,
  );
}

main();

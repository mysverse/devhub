/**
 * Dry-run report for the tightened proof evidence rule.
 *
 * `findQualifyingProof` re-derives proof from Linear comment history on EVERY
 * re-evaluation — the 15-minute eligibility cron, comment webhooks, admin
 * "Retry Eligibility", developer "Retry". So tightening the rule is not a
 * forward-only change: proof that qualified under the old pattern and is
 * currently sitting in WAITING_STABILITY or READY_FOR_PAYOUT can be
 * reclassified as PROOF_NOT_QUALIFYING the next time the evaluator runs.
 *
 * This reports exactly which tasks that would happen to, against the proof
 * body DevHub already stored, so the list can be reviewed — and those
 * developers notified or their proof admin-overridden — BEFORE the rule ships.
 *
 * Read-only: it never writes to the database or to Linear.
 *
 * Usage:
 *   pnpm exec tsx scripts/dev/report-proof-rule-regressions.ts
 */

import { PROOF_MIN_CHARS, PROOF_TAG } from "@/lib/payout-policy";
import { checkProofBody, proofContent } from "@/lib/ppt-proof";
import prisma from "@/lib/prisma";

/**
 * The rule as it stood before this change, kept verbatim so the diff is
 * measured rather than guessed. Delete this script once the rule has shipped.
 */
const OLD_EVIDENCE_PATTERN =
  /https?:\/\/|!\[|screenshot|screen|video|clip|drive|figma|roblox|studio|place|asset|implemented|location|verified|tested|before|after|commit|branch|pull request|pr/i;

function passedOldRule(body: string) {
  const content = proofContent(body);
  return (
    content.length >= PROOF_MIN_CHARS && OLD_EVIDENCE_PATTERN.test(content)
  );
}

/** States whose proof the evaluator will re-derive. PAID/terminal are excluded. */
const AT_RISK_STATUSES = [
  "NEEDS_PROOF",
  "WAITING_STABILITY",
  "READY_FOR_PAYOUT",
  "ON_HOLD",
  "FLAGGED",
  "BLOCKED",
] as const;

async function main() {
  console.log(
    "🔍 Checking stored proof against the tightened evidence rule…\n",
  );

  const states = await prisma.pptPayoutState.findMany({
    where: {
      status: { in: [...AT_RISK_STATUSES] },
      proofCommentBody: { not: null },
    },
    select: {
      linearIssueId: true,
      linearIssueIdentifier: true,
      status: true,
      reason: true,
      proofCommentBody: true,
      proofCommentUrl: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (states.length === 0) {
    console.log(
      "No non-terminal PPT states with stored proof. Nothing to check.",
    );
    return;
  }

  const regressions = states.filter((state) => {
    const body = state.proofCommentBody ?? "";
    return passedOldRule(body) && checkProofBody(body) !== null;
  });

  console.log(
    `Examined ${states.length} non-terminal state(s) with stored proof.`,
  );

  if (regressions.length === 0) {
    console.log("\n✅ No task would be demoted by the tightened rule.");
    return;
  }

  console.log(
    `\n⚠️  ${regressions.length} task(s) would flip to PROOF_NOT_QUALIFYING on the next evaluation:\n`,
  );

  for (const state of regressions) {
    const body = state.proofCommentBody ?? "";
    const rejection = checkProofBody(body);
    const excerpt = proofContent(body).replace(/\s+/g, " ").slice(0, 140);

    console.log(`  ${state.linearIssueIdentifier ?? state.linearIssueId}`);
    console.log(`    now:    ${state.status} (${state.reason ?? "—"})`);
    console.log(`    fails:  ${rejection?.reason}`);
    console.log(`    proof:  "${excerpt}${excerpt.length >= 140 ? "…" : ""}"`);
    if (state.proofCommentUrl)
      console.log(`    link:   ${state.proofCommentUrl}`);
    console.log("");
  }

  console.log(
    "These developers wrote proof that passed the rule in force at the time.\n" +
      "Before shipping, decide for each one: notify them to re-post with a\n" +
      "screenshot attached, or use the admin proof override to let it stand.\n" +
      `Note the stored body is truncated to 1000 chars, so a ${PROOF_TAG} comment\n` +
      "whose evidence sat past that point may be a false positive — open the\n" +
      "Linear link before acting on it.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

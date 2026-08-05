/**
 * One-off remediation for legal names that leaked before the display-name
 * split landed. Three independent phases, all idempotent:
 *
 *   linear        DevHub-authored Linear issue descriptions carrying the old
 *                 "Approved from a DevHub PPT request by <legal name>" footer.
 *   notifications Persisted Notification.message/title rows that interpolated a
 *                 legal name at send time.
 *   profiles      UserProfile.legalName values that are really just the OAuth
 *                 handle, written by the old ensureUserProfile().
 *
 * Dry run by default — pass --apply to write. Scope with --only=<phase>.
 *
 *   pnpm scrub:legal-names
 *   pnpm scrub:legal-names --only=linear --apply
 *   DATABASE_URL=<prod> pnpm scrub:legal-names --apply
 */
import { config } from "dotenv";
import { resolveDisplayName } from "@/lib/display-name";
import { getLinearServiceClient } from "@/lib/linear";
import { fetchIssuesByIds } from "@/lib/linear-queries";
import { DEVHUB_PPT_REQUEST_DESCRIPTION_MARKER } from "@/lib/ppt-request-marker";
import prisma from "@/lib/prisma";

config({ path: ".env.mock", quiet: true });

const apply = process.argv.includes("--apply");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg?.slice("--only=".length) ?? null;

type Phase = "linear" | "notifications" | "profiles";
function runs(phase: Phase) {
  return only === null || only === phase;
}

/**
 * The legacy footer, which carried no marker. Anchored to the end of the
 * description so a quoted mention in the body is never rewritten.
 */
const LEGACY_FOOTER =
  /\n*---\nApproved from a DevHub PPT request by [^\n]*\.\s*$/;

const REPLACEMENT_FOOTER = `\n\n---\n${DEVHUB_PPT_REQUEST_DESCRIPTION_MARKER}\nCreated from a DevHub PPT request.`;

/**
 * Only these (domain, type) pairs ever interpolated a profile legal name.
 * Each maps to the row field naming the SUBJECT whose name may appear, so a
 * replacement only ever touches that one person's name.
 */
const LEAKY_NOTIFICATIONS = [
  { domain: "ppt_request", type: "SUBMITTED" },
  { domain: "incentive", type: "ADMIN_ALERT" },
  { domain: "welcome_pack", type: "SUBMITTED" },
  { domain: "welcome_pack", type: "CANCELLED" },
] as const;

function header(title: string) {
  console.log(`\n${"─".repeat(72)}\n${title}\n${"─".repeat(72)}`);
}

async function scrubLinearDescriptions() {
  header("Linear issue descriptions");

  const client = getLinearServiceClient();
  if (!client) {
    console.log("⚠️  LINEAR_SERVICE_API_KEY not set — skipping this phase.");
    return;
  }

  // Enumerated from DevHub's own database rather than searched in Linear:
  // there is no description filter in the Linear API, and after approval the
  // PptRequest row keeps no new-vs-existing-issue discriminator. The footer
  // anchor below IS the discriminator — approvals that attached to an existing
  // issue got a comment instead, and simply will not match.
  const requests = await prisma.pptRequest.findMany({
    where: { status: "APPROVED", linearIssueId: { not: null } },
    select: {
      id: true,
      linearIssueId: true,
      linearIssueIdentifier: true,
      linearIssueUrl: true,
    },
  });
  console.log(`Approved PPT requests with a Linear issue: ${requests.length}`);
  if (requests.length === 0) return;

  const byIssueId = new Map(
    requests.map((r) => [r.linearIssueId as string, r]),
  );
  const issues = await fetchIssuesByIds(client, [...byIssueId.keys()]);

  const missing = [...byIssueId.keys()].filter(
    (id) => !issues.some((issue) => issue.id === id),
  );
  for (const id of missing) {
    const request = byIssueId.get(id);
    console.log(
      `  NEEDS MANUAL REVIEW  issue ${request?.linearIssueIdentifier ?? id} no longer readable in Linear`,
    );
  }

  let rewritten = 0;
  let alreadyClean = 0;
  for (const issue of issues) {
    const label = issue.identifier || issue.id;
    const description = issue.description ?? "";

    if (description.includes(DEVHUB_PPT_REQUEST_DESCRIPTION_MARKER)) {
      alreadyClean++;
      continue;
    }
    if (!LEGACY_FOOTER.test(description)) {
      alreadyClean++;
      continue;
    }

    const next = description.replace(LEGACY_FOOTER, REPLACEMENT_FOOTER);
    const removed = description.match(LEGACY_FOOTER)?.[0].trim();
    console.log(`  ${label}`);
    console.log(`    - ${removed}`);
    console.log(`    + ${REPLACEMENT_FOOTER.trim().replace(/\n/g, " ")}`);

    if (apply) {
      await client.updateIssue(issue.id, { description: next });
    }
    rewritten++;
  }

  console.log(
    `\n${apply ? "Rewrote" : "Would rewrite"} ${rewritten} description(s); ${alreadyClean} already clean.`,
  );
}

async function scrubNotifications() {
  header("Persisted notification messages");

  const profiles = await prisma.userProfile.findMany({
    where: { legalName: { not: null } },
    select: {
      id: true,
      legalName: true,
      preferredName: true,
      user: { select: { name: true } },
    },
  });
  // Names under three characters are too short to replace safely inside prose.
  const subjects = new Map(
    profiles
      .filter((p) => (p.legalName ?? "").trim().length >= 3)
      .map((p) => [
        p.id,
        {
          legalName: (p.legalName as string).trim(),
          display: resolveDisplayName({ profile: p }),
        },
      ]),
  );
  console.log(`Profiles with a legal name worth scrubbing: ${subjects.size}`);
  if (subjects.size === 0) return;

  const notifications = await prisma.notification.findMany({
    where: { OR: LEAKY_NOTIFICATIONS.map((n) => ({ ...n })) },
    select: {
      id: true,
      domain: true,
      type: true,
      title: true,
      message: true,
      actorId: true,
      entityId: true,
    },
  });
  console.log(`Candidate notifications: ${notifications.length}`);

  // Resolve the subject for entity-keyed rows in bulk.
  const incentiveIds = notifications
    .filter((n) => n.domain === "incentive")
    .flatMap((n) => (n.entityId ? [n.entityId] : []));
  const orderIds = notifications
    .filter((n) => n.domain === "welcome_pack")
    .flatMap((n) => (n.entityId ? [n.entityId] : []));

  const [awards, orders] = await Promise.all([
    incentiveIds.length
      ? prisma.incentiveAward.findMany({
          where: { id: { in: incentiveIds } },
          select: { id: true, userId: true },
        })
      : [],
    orderIds.length
      ? prisma.welcomePackOrder.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, userId: true },
        })
      : [],
  ]);
  const awardOwner = new Map(awards.map((a) => [a.id, a.userId]));
  const orderOwner = new Map(orders.map((o) => [o.id, o.userId]));

  function subjectIdFor(n: (typeof notifications)[number]) {
    if (n.domain === "ppt_request") return n.actorId;
    if (n.domain === "incentive")
      return n.entityId && awardOwner.get(n.entityId);
    if (n.domain === "welcome_pack")
      return n.entityId && orderOwner.get(n.entityId);
    return null;
  }

  let changed = 0;
  for (const n of notifications) {
    const subjectId = subjectIdFor(n);
    const subject = subjectId ? subjects.get(subjectId) : undefined;
    if (!subject) continue;

    const message = n.message.replaceAll(subject.legalName, subject.display);
    const title = n.title.replaceAll(subject.legalName, subject.display);
    if (message === n.message && title === n.title) continue;

    console.log(`  ${n.domain}:${n.type} ${n.id}`);
    console.log(`    - ${n.message}`);
    console.log(`    + ${message}`);

    if (apply) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { message, title },
      });
    }
    changed++;
  }

  console.log(
    `\n${apply ? "Rewrote" : "Would rewrite"} ${changed} notification(s).`,
  );
  if (changed > 0) {
    console.log(
      "NOTE: already-delivered emails cannot be recalled — this fixes the\n" +
        "in-app history only.",
    );
  }
}

async function scrubProfiles() {
  header("Profiles whose legalName is really an OAuth handle");

  const profiles = await prisma.userProfile.findMany({
    where: { legalName: { not: null } },
    select: {
      id: true,
      legalName: true,
      preferredName: true,
      user: { select: { name: true } },
    },
  });

  const exact: typeof profiles = [];
  const suspects: typeof profiles = [];
  for (const p of profiles) {
    const legal = (p.legalName ?? "").trim();
    const oauth = (p.user?.name ?? "").trim();
    if (legal && oauth && legal.toLowerCase() === oauth.toLowerCase()) {
      exact.push(p);
    } else if (legal && !/\s/.test(legal)) {
      suspects.push(p);
    }
  }

  console.log(
    `Exact matches with the OAuth name (safe to clear): ${exact.length}`,
  );
  for (const p of exact) console.log(`  ${p.id}  "${p.legalName}"`);

  console.log(
    `\nSingle-token legal names (REPORT ONLY — never auto-cleared): ${suspects.length}`,
  );
  for (const p of suspects) console.log(`  ${p.id}  "${p.legalName}"`);

  if (apply && exact.length > 0) {
    await prisma.userProfile.updateMany({
      where: { id: { in: exact.map((p) => p.id) } },
      data: { legalName: null },
    });
    console.log(`\nCleared ${exact.length} legalName value(s).`);
    console.log(
      "Those users now need a real legal name before documents or payouts\n" +
        "can be processed — send the reminder from the admin Users table.",
    );
  } else if (exact.length > 0) {
    console.log(`\nWould clear ${exact.length} legalName value(s).`);
  }
}

async function main() {
  console.log(
    apply
      ? "🔧 scrub-legal-name-leaks — APPLYING CHANGES"
      : "🔍 scrub-legal-name-leaks — dry run (pass --apply to write)",
  );
  if (only) console.log(`Scoped to phase: ${only}`);

  if (runs("linear")) await scrubLinearDescriptions();
  if (runs("notifications")) await scrubNotifications();
  if (runs("profiles")) await scrubProfiles();

  console.log(
    apply
      ? "\n✅ Done. Re-run without --apply to confirm nothing is left."
      : "\n✅ Dry run complete. Re-run with --apply to write.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));

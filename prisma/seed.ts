/**
 * Dev-mode seed: full page-coverage data for every dashboard and admin page,
 * built from the shared fixtures in src/dev/fixtures/* so DB rows always
 * agree with the mock Linear/payment handlers.
 *
 * Run via `pnpm dev:mock` (or `pnpm dev:mock:seed`), which loads .env.mock
 * and points DATABASE_URL at the local prisma-dev server. Refuses to run
 * against anything else. Assumes an empty database (the orchestrator only
 * seeds when the User table is empty, or after --reset).
 */

import type { PptAssignmentWatchStatus } from "@prisma/client";
import {
  type DevLinearIssue,
  daysAgo,
  getIssueByIdentifier,
  issueUrl,
  LINEAR_ISSUES,
  LINEAR_PROJECT,
  LINEAR_STATES,
  LINEAR_TEAM,
  LINEAR_USERS,
} from "@/dev/fixtures/linear";
import { BILLPLZ_SEEDED_PAYMENT_ORDER_ID } from "@/dev/fixtures/payments";
import {
  BACKGROUND_USERS,
  PERSONAS,
  type Persona,
} from "@/dev/fixtures/personas";
import { auth } from "@/lib/auth";
import {
  estimateToAmount,
  linearEstimateToComplexityLevel,
} from "@/lib/currency";
import { assertDevModeSafety, DEV_PASSWORD } from "@/lib/dev-mode";
import { getDocumentTemplate } from "@/lib/documents";
import { getWeekKey } from "@/lib/incentives";
import prisma from "@/lib/prisma";

const now = new Date();

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function dateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function hoursAgo(hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function complexity(estimate: number | null): number | null {
  return linearEstimateToComplexityLevel(estimate);
}

function myr(estimate: number | null): number {
  const level = complexity(estimate);
  return level ? estimateToAmount(level, "MYR") : 0;
}

/** Shared Linear-derived columns for Transaction/PptPayoutState/etc. */
function issueColumns(issue: DevLinearIssue) {
  return {
    linearIssueId: issue.id,
    linearIssueIdentifier: issue.identifier,
    linearIssueTitle: issue.title,
    linearIssueUrl: issueUrl(issue),
  };
}

async function createPersonaUser(persona: Persona): Promise<string> {
  await auth.api.signUpEmail({
    body: {
      email: persona.email,
      password: DEV_PASSWORD,
      name: persona.name,
    },
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: persona.email },
    select: { id: true },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });
  return user.id;
}

async function createProviderAccounts(
  userId: string,
  persona: {
    key: string;
    linearId: string | null;
    discordId: string | null;
    robloxId: string | null;
  },
) {
  const providers: Array<{ providerId: string; accountId: string | null }> = [
    { providerId: "linear", accountId: persona.linearId },
    { providerId: "discord", accountId: persona.discordId },
    { providerId: "roblox", accountId: persona.robloxId },
  ];
  for (const { providerId, accountId } of providers) {
    if (!accountId) continue;
    await prisma.account.create({
      data: {
        id: `acc-${providerId}-${persona.key}`,
        userId,
        providerId,
        accountId,
        accessToken: `mock-${providerId}-access-token-${persona.key}`,
        refreshToken: `mock-${providerId}-refresh-token-${persona.key}`,
        // null expiry → getValidLinearToken uses the token as-is, no refresh.
        accessTokenExpiresAt: null,
        scope: providerId === "linear" ? "read,write,issues:create" : null,
      },
    });
  }
}

export async function seed() {
  assertDevModeSafety();
  console.log("[seed] Seeding dev-mode data...");

  // ── Users & profiles ───────────────────────────────────────────────────────
  const adminId = await createPersonaUser(PERSONAS.admin);
  const devId = await createPersonaUser(PERSONAS.developer);
  await createPersonaUser(PERSONAS.fresh); // user only — exercises onboarding
  const proxyId = await createPersonaUser(PERSONAS.proxy);

  await createProviderAccounts(adminId, PERSONAS.admin);
  await createProviderAccounts(devId, PERSONAS.developer);
  await createProviderAccounts(proxyId, PERSONAS.proxy);

  for (const user of BACKGROUND_USERS) {
    await prisma.user.create({
      data: {
        id: user.userId,
        name: user.name,
        email: user.email,
        emailVerified: true,
        // Account age is load-bearing: the first-task invite holds off for a
        // grace period after signup, so a "created now" user would be skipped
        // and the never-activated path would look broken.
        createdAt: daysAgo(user.userId === "dev-user-nadia" ? 30 : 500),
      },
    });
  }
  const [bala, mei, ravi, nadia] = BACKGROUND_USERS;

  /** linearId → DB userId for everyone with a profile. */
  const userIdByLinearId = new Map<string, string>([
    [PERSONAS.admin.linearId as string, adminId],
    [PERSONAS.developer.linearId as string, devId],
    [PERSONAS.proxy.linearId as string, proxyId],
    ...BACKGROUND_USERS.map(
      (user) => [user.linearId, user.userId] as [string, string],
    ),
  ]);

  await prisma.userProfile.create({
    data: {
      id: adminId,
      discordId: PERSONAS.admin.discordId,
      robloxId: PERSONAS.admin.robloxId,
      linearId: PERSONAS.admin.linearId,
      linearEmail: PERSONAS.admin.email,
      preferredName: PERSONAS.admin.preferredName,
      // Deliberately distinct from preferredName: any screen still rendering a
      // full Malaysian legal name is a live PII leak during verification.
      legalName: "Nurul Aina binti Ahmad",
      role: "ADMIN",
      developerRank: "HEAD_DEVELOPER",
      specialties: ["SCRIPTING"],
      probationStartedAt: daysAgo(700),
      initialReviewAt: daysAgo(660),
      finalReviewAt: daysAgo(610),
      paymentMethod: "DUITNOW",
      // Both a proxy and a bank triple, stored normalized the way the write
      // paths store it. classifyPayoutRoute pays the bank triple here, so this
      // is the fixture that catches a display surface preferring the proxy.
      duitNowId: "+60123456789",
      duitNowIdType: "MOBILE",
      duitNowIdStatus: "RESOLVED",
      duitNowIdCheckedAt: daysAgo(20),
      bankName: "MBBEMYKL",
      bankAccountNumber: "512345678901",
      bankAccountName: "Nurul Aina binti Ahmad",
    },
  });

  await prisma.userProfile.create({
    data: {
      id: devId,
      discordId: PERSONAS.developer.discordId,
      robloxId: PERSONAS.developer.robloxId,
      linearId: PERSONAS.developer.linearId,
      linearEmail: PERSONAS.developer.email,
      preferredName: PERSONAS.developer.preferredName,
      legalName: "Alexander Tan Wei Ming",
      shippingAddress: "12 Jalan Cempaka, 50450 Kuala Lumpur, Malaysia",
      role: "DEVELOPER",
      developerRank: "DEVELOPER",
      specialties: ["SCRIPTING", "VEHICLES"],
      probationStartedAt: daysAgo(365),
      initialReviewAt: daysAgo(335),
      finalReviewAt: daysAgo(275),
      paymentMethod: "DUITNOW",
      duitNowId: "+60198765432",
      duitNowIdType: "MOBILE",
      duitNowIdStatus: "CONFIRMED",
      duitNowIdCheckedAt: daysAgo(45),
      bankName: "MBBEMYKL",
      bankAccountNumber: "514812345678",
      bankAccountName: "Alexander Tan Wei Ming",
    },
  });

  // Proxy-only: a DuitNow ID and no bank triple at all. classifyPayoutRoute
  // sends this one down the manual path, which is the path the admin bank
  // lookup exists to serve. PASSPORT is the proxy type the old validator
  // rejected outright, so this fixture also proves it now saves.
  await prisma.userProfile.create({
    data: {
      id: proxyId,
      discordId: PERSONAS.proxy.discordId,
      robloxId: PERSONAS.proxy.robloxId,
      linearId: PERSONAS.proxy.linearId,
      linearEmail: PERSONAS.proxy.email,
      preferredName: PERSONAS.proxy.preferredName,
      legalName: "Priya a/p Devan",
      role: "DEVELOPER",
      developerRank: "DEVELOPER",
      specialties: ["SCRIPTING"],
      probationStartedAt: daysAgo(300),
      initialReviewAt: daysAgo(270),
      finalReviewAt: daysAgo(210),
      paymentMethod: "DUITNOW",
      duitNowId: "A12345678",
      duitNowIdType: "PASSPORT",
      duitNowIdStatus: "UNCONFIRMED",
    },
  });

  const backgroundProfiles = [
    {
      user: bala,
      legalName: "Balachandran a/l Murugan",
      rank: "SENIOR_DEVELOPER" as const,
      specialties: ["BUILDING" as const],
      paymentMethod: "DUITNOW" as const,
      duitNowId: "+60171234567",
      duitNowIdType: "MOBILE" as const,
      // An admin looked this up in the bank and nothing came back. Drives the
      // developer-facing fault banner and the admin card's unreachable state.
      duitNowIdStatus: "UNREACHABLE" as const,
      duitNowIdIssue: "NOT_FOUND" as const,
    },
    {
      user: mei,
      legalName: "Chong Mei Ling",
      rank: "DEVELOPER" as const,
      specialties: ["MESHING" as const],
      paymentMethod: "BANK_TRANSFER" as const,
      duitNowId: null,
      duitNowIdType: null,
      duitNowIdStatus: "UNCONFIRMED" as const,
      duitNowIdIssue: null,
    },
    {
      user: ravi,
      legalName: "Ravindran a/l Suppiah",
      rank: "JUNIOR_DEVELOPER" as const,
      specialties: ["SCRIPTING" as const],
      paymentMethod: "ROBUX" as const,
      duitNowId: null,
      duitNowIdType: null,
      duitNowIdStatus: "UNCONFIRMED" as const,
      duitNowIdIssue: null,
    },
    {
      // Never claimed anything: no watches, no transactions, nothing below
      // references her. Deliberately left empty so the re-engagement path has
      // a real subject.
      user: nadia,
      legalName: "Nadia binti Rahman",
      rank: "PROBATIONARY_DEVELOPER" as const,
      specialties: ["BUILDING" as const],
      paymentMethod: "PAYPAL" as const,
      duitNowId: null,
      duitNowIdType: null,
      duitNowIdStatus: "UNCONFIRMED" as const,
      duitNowIdIssue: null,
    },
  ];
  for (const entry of backgroundProfiles) {
    await prisma.userProfile.create({
      data: {
        id: entry.user.userId,
        discordId: entry.user.discordId,
        robloxId: entry.user.robloxId,
        linearId: entry.user.linearId,
        linearEmail: entry.user.email,
        preferredName: entry.user.preferredName,
        legalName: entry.legalName,
        role: "DEVELOPER",
        developerRank: entry.rank,
        specialties: entry.specialties,
        probationStartedAt: daysAgo(500),
        paymentMethod: entry.paymentMethod,
        duitNowId: entry.duitNowId,
        duitNowIdType: entry.duitNowIdType,
        duitNowIdStatus: entry.duitNowIdStatus,
        duitNowIdIssue: entry.duitNowIdIssue,
        bankName: entry.paymentMethod === "BANK_TRANSFER" ? "CIBBMYKL" : null,
        bankAccountNumber:
          entry.paymentMethod === "BANK_TRANSFER" ? "760123456789" : null,
        bankAccountName:
          entry.paymentMethod === "BANK_TRANSFER" ? entry.legalName : null,
        robuxUsername: entry.paymentMethod === "ROBUX" ? "RaviScripts" : null,
      },
    });
  }

  // A complete assistant thread keeps the chat transcript and confirmation
  // card visible in screenshots without making any external model request.
  await prisma.assistantConversation.create({
    data: {
      id: "assistant-conversation-developer",
      userId: devId,
      title: "Plan a spawn audit tool",
      messages: {
        create: [
          {
            id: "assistant-message-developer-user",
            role: "USER",
            content:
              "Help me turn a spawn-point audit tool into a small, verifiable task.",
          },
          {
            id: "assistant-message-developer-reply",
            role: "ASSISTANT",
            content:
              "A tight first version can scan the current place, list every spawn point, and flag duplicate names or missing team assignments. I prepared an ordinary Linear issue for review; it is not a PPT and does not guarantee payment.",
            provider: "openai",
            model: "gpt-5.6-luna",
          },
        ],
      },
      actions: {
        create: {
          id: "assistant-action-developer-create",
          messageId: "assistant-message-developer-reply",
          userId: devId,
          kind: "create_task",
          payload: {
            title: "Add a spawn-point audit tool",
            description:
              "Scan the active place and report duplicate spawn names and missing team assignments.",
            teamId: LINEAR_TEAM.id,
            projectId: LINEAR_PROJECT.id,
            dueDate: dateOnlyUtc(new Date(now.getTime() + 7 * 86_400_000)),
          },
          preview: {
            title: "Create ordinary Linear issue: Add a spawn-point audit tool",
            description:
              "Creates an unlabelled Linear issue in the selected team.",
            warning: "This is not a PPT and does not guarantee payment.",
          },
          expiresAt: new Date(now.getTime() + 7 * 86_400_000),
          idempotencyKey: "assistant:seed:create-spawn-audit",
        },
      },
    },
  });

  // ── Access & integration config ────────────────────────────────────────────
  await prisma.accessIntegrationConfig.create({
    data: {
      id: "default",
      robloxDevelopmentGroupId: process.env.ROBLOX_GROUP_ID ?? "12345678",
      robloxPublisherGroupId: "87654321",
      discordGuildId: "900000000000000001",
    },
  });
  await prisma.rankRoleMapping.createMany({
    data: [
      {
        rank: "JUNIOR_DEVELOPER",
        robloxRoleId: "101",
        discordRoleId: "910000000000000001",
      },
      {
        rank: "DEVELOPER",
        robloxRoleId: "102",
        discordRoleId: "910000000000000002",
      },
      {
        rank: "SENIOR_DEVELOPER",
        robloxRoleId: "103",
        discordRoleId: "910000000000000003",
      },
      {
        rank: "HEAD_DEVELOPER",
        robloxRoleId: "105",
        discordRoleId: "910000000000000005",
      },
    ],
  });
  await prisma.specialtyRoleMapping.createMany({
    data: [
      { specialty: "SCRIPTING", discordRoleId: "920000000000000001" },
      { specialty: "BUILDING", discordRoleId: "920000000000000002" },
      { specialty: "MESHING", discordRoleId: "920000000000000003" },
      { specialty: "VEHICLES", discordRoleId: "920000000000000004" },
    ],
  });

  const projectSentinel = await prisma.devProject.create({
    data: {
      name: "Project Sentinel",
      slug: "project-sentinel",
      description: "Next-generation emergency services experience.",
      robloxDeveloperRoleId: "201",
      discordDeveloperRoleId: "930000000000000001",
      linearTeamId: LINEAR_TEAM.id,
      linearProjectId: LINEAR_PROJECT.id,
    },
  });
  const projectBandar = await prisma.devProject.create({
    data: {
      name: "Bandar Lights",
      slug: "bandar-lights",
      description: "City lighting and ambience refresh.",
      linearTeamId: LINEAR_TEAM.id,
    },
  });
  await prisma.projectMembership.createMany({
    data: [
      {
        userId: devId,
        projectId: projectSentinel.id,
        accessLevel: "DEVELOPER",
        assignedById: adminId,
      },
      {
        userId: bala.userId,
        projectId: projectSentinel.id,
        accessLevel: "DEVELOPER",
        assignedById: adminId,
      },
      {
        userId: mei.userId,
        projectId: projectBandar.id,
        accessLevel: "CONTRIBUTOR",
        assignedById: adminId,
      },
      {
        userId: adminId,
        projectId: projectSentinel.id,
        accessLevel: "PUBLISHER",
      },
    ],
  });
  await prisma.accessManagedRole.createMany({
    data: [
      { platform: "DISCORD", scope: "rank", roleId: "910000000000000002" },
      { platform: "ROBLOX_OPEN_CLOUD", scope: "development", roleId: "102" },
    ],
  });
  await prisma.accessSyncLog.createMany({
    data: [
      {
        userId: devId,
        actorId: adminId,
        platform: "DISCORD",
        status: "SUCCESS",
        action: "ASSIGN_RANK_ROLE",
        details: { roleId: "910000000000000002" },
        createdAt: daysAgo(3),
      },
      {
        userId: devId,
        platform: "ROBLOX_OPEN_CLOUD",
        status: "SUCCESS",
        action: "ASSIGN_GROUP_ROLE",
        details: { roleId: "102" },
        createdAt: daysAgo(3),
      },
      {
        userId: mei.userId,
        platform: "LINEAR",
        status: "FAILED",
        action: "ADD_TEAM_MEMBERSHIP",
        error: "Linear team membership already exists",
        createdAt: daysAgo(1),
      },
    ],
  });

  // ── Program config singletons ──────────────────────────────────────────────
  await prisma.bonusConfig.create({
    data: { id: "default", enabled: true },
  });
  await prisma.incentiveConfig.create({
    data: {
      id: "default",
      enabled: true,
      activatedAt: daysAgo(60),
      weeklyThreshold: 5,
    },
  });

  // ── Payout campaigns ───────────────────────────────────────────────────────
  // Windows are relative to seed time so the fixtures stay in the right state
  // whenever dev mode is booted. One of each shape the UI has to handle: live,
  // scheduled, ended, and a live campaign whose uplift pool is already spent
  // (payouts under it silently fall back to the normal rate — the case that is
  // hardest to notice and therefore most worth being able to see).
  const liveCampaign = await prisma.payoutCampaign.create({
    data: {
      slug: "sprint-boost",
      name: "Sprint Boost",
      headline: "Every PPT task pays extra this sprint",
      body: "Every PPT payout is tripled until the sprint closes. Nothing to opt into.",
      accentColor: "violet",
      multiplier: 3,
      scopes: ["PPT", "BONUS"],
      enabled: true,
      startsAt: daysAgo(3),
      endsAt: daysAgo(-4),
      upliftPoolMyr: 2000,
      perUserUpliftCapMyr: 400,
      createdAt: daysAgo(5),
    },
  });

  await prisma.payoutCampaign.create({
    data: {
      slug: "docs-week",
      name: "Docs Week",
      headline: "Documentation tasks pay extra this week",
      accentColor: "teal",
      multiplier: 2,
      scopes: ["PPT"],
      enabled: true,
      startsAt: daysAgo(-7),
      endsAt: daysAgo(-14),
      includedLabels: ["Docs"],
      createdAt: daysAgo(2),
    },
  });

  await prisma.payoutCampaign.create({
    data: {
      slug: "launch-push",
      name: "Launch Push",
      headline: "Incentive awards boosted through launch week",
      accentColor: "orange",
      multiplier: 2,
      scopes: ["INCENTIVE"],
      enabled: true,
      startsAt: daysAgo(21),
      endsAt: daysAgo(4),
      createdAt: daysAgo(25),
    },
  });

  const exhaustedCampaign = await prisma.payoutCampaign.create({
    data: {
      slug: "robux-blitz",
      name: "Robux Blitz",
      headline: "Robux payouts boosted",
      accentColor: "grape",
      multiplier: 2,
      scopes: ["PPT"],
      enabled: true,
      startsAt: daysAgo(1),
      endsAt: daysAgo(-6),
      upliftPoolRobux: 1200,
      createdAt: daysAgo(1),
    },
  });

  // Ledger rows: one live campaign with spend to show in the admin ledger, and
  // one whose pool is exactly consumed so the fallback-to-1x path is visible.
  await prisma.payoutCampaignApplication.createMany({
    data: [
      {
        campaignId: liveCampaign.id,
        scope: "PPT",
        entityId: "seed-ppt-uplift-1",
        userId: devId,
        currency: "MYR",
        baseAmount: 40,
        multiplier: 3,
        upliftAmount: 80,
        createdAt: daysAgo(2),
      },
      {
        campaignId: liveCampaign.id,
        scope: "BONUS",
        entityId: "seed-bonus-uplift-1",
        userId: devId,
        currency: "MYR",
        baseAmount: 60,
        multiplier: 3,
        upliftAmount: 120,
        createdAt: daysAgo(1),
      },
      {
        campaignId: exhaustedCampaign.id,
        scope: "PPT",
        entityId: "seed-robux-uplift-1",
        userId: devId,
        currency: "ROBUX",
        baseAmount: 1200,
        multiplier: 2,
        upliftAmount: 1200,
        createdAt: hoursAgo(6),
      },
    ],
  });

  // ── Transactions & payouts ─────────────────────────────────────────────────
  const issue = getIssueByIdentifier;

  const txPaid220 = await prisma.transaction.create({
    data: {
      userId: devId,
      ...issueColumns(issue("MYS-220")),
      amount: myr(2),
      currency: "MYR",
      source: "PPT",
      status: "PAID",
      autoApproved: true,
      createdAt: daysAgo(8),
      paidAt: daysAgo(7),
      payout: {
        create: {
          provider: "BILLPLZ",
          providerPayoutId: "mock-billplz-po-000",
          status: "COMPLETED",
          createdAt: daysAgo(8),
          completedAt: daysAgo(7),
        },
      },
    },
  });

  const txPaid227 = await prisma.transaction.create({
    data: {
      userId: devId,
      ...issueColumns(issue("MYS-227")),
      amount: myr(2),
      currency: "MYR",
      source: "PPT",
      status: "PAID",
      autoApproved: true,
      createdAt: daysAgo(10),
      paidAt: daysAgo(9),
    },
  });

  // Auto-payout in flight: target of `pnpm simulate billplz` and the
  // billplz-poll cron — Payout PROCESSING with the shared fixture id.
  const txPending229 = await prisma.transaction.create({
    data: {
      userId: devId,
      ...issueColumns(issue("MYS-229")),
      amount: myr(2),
      currency: "MYR",
      source: "PPT",
      status: "PENDING",
      autoApproved: true,
      createdAt: daysAgo(3),
      payout: {
        create: {
          provider: "BILLPLZ",
          providerPayoutId: BILLPLZ_SEEDED_PAYMENT_ORDER_ID,
          status: "PROCESSING",
          createdAt: daysAgo(3),
        },
      },
    },
  });

  const txPending223 = await prisma.transaction.create({
    data: {
      userId: bala.userId,
      ...issueColumns(issue("MYS-223")),
      amount: myr(2),
      currency: "MYR",
      source: "PPT",
      status: "PENDING",
      createdAt: daysAgo(4),
    },
  });

  const txPaid226 = await prisma.transaction.create({
    data: {
      userId: ravi.userId,
      ...issueColumns(issue("MYS-226")),
      amount: estimateToAmount(1, "ROBUX"),
      currency: "ROBUX",
      source: "PPT",
      status: "PAID",
      createdAt: daysAgo(6),
      paidAt: daysAgo(5),
      payout: {
        create: {
          provider: "ROBLOX",
          providerPayoutId: "mock-finsys-1001",
          status: "COMPLETED",
          createdAt: daysAgo(6),
          completedAt: daysAgo(5),
        },
      },
    },
  });

  const txBonusPending = await prisma.transaction.create({
    data: {
      userId: devId,
      linearIssueTitle: `Bonus payout ${monthKey(now)}`,
      amount: 80,
      currency: "MYR",
      source: "BONUS",
      bonusPeriod: monthKey(now),
      status: "PENDING",
      createdAt: daysAgo(2),
    },
  });

  await prisma.transaction.create({
    data: {
      userId: devId,
      linearIssueTitle: `Bonus payout ${monthKey(daysAgo(35))}`,
      amount: 120,
      currency: "MYR",
      source: "BONUS",
      bonusPeriod: monthKey(daysAgo(35)),
      status: "PAID",
      createdAt: daysAgo(32),
      paidAt: daysAgo(30),
    },
  });

  await prisma.transaction.create({
    data: {
      userId: devId,
      linearIssueTitle: "Asset pack commission (manual)",
      amount: 20,
      currency: "MYR",
      source: "MANUAL",
      status: "REJECTED",
      createdAt: daysAgo(20),
      rejectedAt: daysAgo(19),
      rejectionReason: "Duplicate of an earlier payout request",
    },
  });

  const txIncentivePaid = await prisma.transaction.create({
    data: {
      userId: devId,
      linearIssueTitle: "Weekly throughput incentive",
      amount: 30,
      currency: "MYR",
      source: "INCENTIVE",
      status: "PAID",
      createdAt: daysAgo(9),
      paidAt: daysAgo(8),
    },
  });

  // ── PPT payout states ──────────────────────────────────────────────────────
  type PptStateSpec = {
    identifier: string;
    status:
      | "BLOCKED"
      | "NEEDS_PROOF"
      | "WAITING_STABILITY"
      | "READY_FOR_PAYOUT"
      | "TRANSACTION_PENDING"
      | "ON_HOLD"
      | "PAID"
      | "FLAGGED";
    reason:
      | "ISSUE_CANCELED"
      | "MISSING_PROOF"
      | "WAITING_STABILITY"
      | "READY_FOR_PAYOUT"
      | "AUTO_PAYOUT_STARTED"
      | "TRANSACTION_CREATED"
      | "REOPENED_BEFORE_PAYOUT"
      | "PAID_ISSUE_REOPENED"
      | null;
    transactionId?: string;
    withProof?: boolean;
  };

  const pptStateSpecs: PptStateSpec[] = [
    { identifier: "MYS-230", status: "BLOCKED", reason: "ISSUE_CANCELED" },
    { identifier: "MYS-222", status: "NEEDS_PROOF", reason: "MISSING_PROOF" },
    {
      identifier: "MYS-228",
      status: "WAITING_STABILITY",
      reason: "WAITING_STABILITY",
      withProof: true,
    },
    {
      identifier: "MYS-221",
      status: "READY_FOR_PAYOUT",
      reason: "READY_FOR_PAYOUT",
      withProof: true,
    },
    {
      identifier: "MYS-229",
      status: "TRANSACTION_PENDING",
      reason: "AUTO_PAYOUT_STARTED",
      transactionId: txPending229.id,
      withProof: true,
    },
    {
      identifier: "MYS-223",
      status: "TRANSACTION_PENDING",
      reason: "TRANSACTION_CREATED",
      transactionId: txPending223.id,
      withProof: true,
    },
    {
      identifier: "MYS-224",
      status: "ON_HOLD",
      reason: "REOPENED_BEFORE_PAYOUT",
      withProof: true,
    },
    {
      identifier: "MYS-220",
      status: "PAID",
      reason: null,
      transactionId: txPaid220.id,
      withProof: true,
    },
    {
      identifier: "MYS-226",
      status: "PAID",
      reason: null,
      transactionId: txPaid226.id,
      withProof: true,
    },
    {
      identifier: "MYS-227",
      status: "FLAGGED",
      reason: "PAID_ISSUE_REOPENED",
      transactionId: txPaid227.id,
      withProof: true,
    },
  ];

  const pptStateIdByIdentifier = new Map<string, string>();
  for (const spec of pptStateSpecs) {
    const fixtureIssue = issue(spec.identifier);
    const completedAt =
      fixtureIssue.completedDaysAgo != null
        ? daysAgo(fixtureIssue.completedDaysAgo)
        : null;
    const proofComment = spec.withProof
      ? fixtureIssue.comments?.[0]
      : undefined;
    const assignee = LINEAR_USERS.find((u) => u.id === fixtureIssue.assigneeId);

    const state = await prisma.pptPayoutState.create({
      data: {
        ...issueColumns(fixtureIssue),
        latestLinearStateType: LINEAR_STATES[fixtureIssue.stateType].type,
        latestLinearStateName: LINEAR_STATES[fixtureIssue.stateType].name,
        latestLinearUpdatedAt: completedAt ?? daysAgo(1),
        hasPptLabel: fixtureIssue.labelNames.includes("PPT"),
        estimate: complexity(fixtureIssue.estimate),
        userId: fixtureIssue.assigneeId
          ? (userIdByLinearId.get(fixtureIssue.assigneeId) ?? null)
          : null,
        assigneeLinearId: fixtureIssue.assigneeId,
        assigneeEmail: assignee?.email ?? null,
        assigneeName: assignee?.name ?? null,
        status: spec.status,
        reason: spec.reason,
        completionEpisode: 1,
        completedAt,
        canceledAt:
          fixtureIssue.canceledDaysAgo != null
            ? daysAgo(fixtureIssue.canceledDaysAgo)
            : null,
        ...(proofComment
          ? {
              proofCommentId: proofComment.id,
              proofCommentUrl: `${issueUrl(fixtureIssue)}#comment-${proofComment.id}`,
              proofCommentBody: proofComment.body,
              proofAuthorLinearId: proofComment.userId,
              proofProvidedAt: daysAgo(proofComment.createdDaysAgo),
            }
          : {}),
        transactionId: spec.transactionId ?? null,
      },
    });
    pptStateIdByIdentifier.set(spec.identifier, state.id);

    await prisma.pptPayoutEvent.create({
      data: {
        stateId: state.id,
        linearIssueId: fixtureIssue.id,
        type: "COMPLETED_DETECTED",
        message: "Issue moved to Done",
        createdAt: completedAt ?? daysAgo(1),
      },
    });
    if (proofComment) {
      await prisma.pptPayoutEvent.create({
        data: {
          stateId: state.id,
          linearIssueId: fixtureIssue.id,
          type: "PROOF_ACCEPTED",
          actorLinearId: proofComment.userId,
          message: "Proof comment accepted",
          createdAt: daysAgo(proofComment.createdDaysAgo),
        },
      });
    }
    if (spec.status === "TRANSACTION_PENDING") {
      await prisma.pptPayoutEvent.create({
        data: {
          stateId: state.id,
          linearIssueId: fixtureIssue.id,
          type: "TRANSACTION_CREATED",
          reason: spec.reason,
          message: "Payout transaction created",
        },
      });
    }
  }

  for (const notification of [
    {
      stateId: pptStateIdByIdentifier.get("MYS-221") as string,
      type: "READY",
      title: "MYS-221 is ready for payout",
      message:
        "Add weapon holstering animations cleared all checks and is queued for payout.",
      createdAt: daysAgo(2),
      readAt: null,
      seenAt: null,
    },
    {
      stateId: pptStateIdByIdentifier.get("MYS-230") as string,
      type: "BLOCKED",
      title: "MYS-230 payout blocked",
      message: "Prototype drone camera system was canceled before payout.",
      createdAt: daysAgo(7),
      readAt: null,
      seenAt: daysAgo(7),
    },
    {
      stateId: pptStateIdByIdentifier.get("MYS-220") as string,
      type: "PROOF_ACCEPTED",
      title: "Proof accepted for MYS-220",
      message: "Ship patrol radio overhaul proof was accepted.",
      readAt: daysAgo(6),
      createdAt: daysAgo(8),
      seenAt: daysAgo(6),
    },
  ]) {
    await prisma.notification.create({
      data: {
        userId: devId,
        domain: "ppt",
        type: notification.type,
        title: notification.title,
        message: notification.message,
        href: "/dashboard/ppts",
        entityType: "ppt_payout_state",
        entityId: notification.stateId,
        dedupeKey: `seed:ppt:${notification.stateId}:${notification.type}`,
        createdAt: notification.createdAt,
        deliveries: {
          create: {
            channel: "in_app",
            status: "SENT",
            sentAt: notification.createdAt,
            readAt: notification.readAt,
            seenAt: notification.seenAt,
            createdAt: notification.createdAt,
          },
        },
      },
    });
  }

  // ── PPT comment attachments ────────────────────────────────────────────────
  // The DB half of the proof screenshots the fixture comments already embed.
  // Review surfaces read this table rather than re-parsing comment markdown
  // (PptPayoutState.proofCommentBody is truncated), so without these rows the
  // inline proof gallery is empty in dev mode even though the comment shows an
  // image. The asset URL template mirrors proofCommentBody() in
  // src/dev/fixtures/linear.ts — the mock Linear handler serves a placeholder
  // PNG for that path, so the image proxy resolves instead of 404-ing.
  function proofAttachmentSeed(
    identifier: string,
    file: string,
    sortOrder = 0,
  ) {
    const fixtureIssue = issue(identifier);
    const proofComment = fixtureIssue.comments?.[0];
    if (!proofComment) {
      throw new Error(
        `${identifier} must have a proof comment for attachment seed data.`,
      );
    }
    const uploadedById = userIdByLinearId.get(proofComment.userId);
    if (!uploadedById) {
      throw new Error(
        `${identifier}'s proof author needs a seeded profile to own attachments.`,
      );
    }
    // Posted with the comment, so the row is terminal from the start — an
    // UPLOADED row here would be swept by the data-retention cron.
    const postedAt = daysAgo(proofComment.createdDaysAgo);
    return {
      id: `seed-ppt-attachment-${identifier.toLowerCase()}-${file}`,
      linearIssueId: fixtureIssue.id,
      uploadedById,
      kind: "PROOF" as const,
      status: "POSTED" as const,
      filename: `${identifier}-${file}.png`,
      mimeType: "image/png",
      byteSize: 512,
      // The mock Linear handler serves a 1×1 placeholder for these URLs, so
      // the recorded dimensions match the bytes a dev-mode client gets back.
      width: 1,
      height: 1,
      linearAssetUrl: `https://uploads.linear.app/devhub/proof-${identifier}/${identifier}-${file}.png`,
      transport: "dev",
      sortOrder,
      linearCommentId: proofComment.id,
      postedAt,
      createdAt: postedAt,
    };
  }

  await prisma.pptCommentAttachment.createMany({
    data: [
      // MYS-221 (READY_FOR_PAYOUT) and MYS-228 (WAITING_STABILITY) are the
      // two an admin actually reviews; MYS-223 is a background developer's, so
      // the surface is exercised with an uploader who isn't the dev persona.
      proofAttachmentSeed("MYS-221", "result"),
      // Second file on the same comment: proofCommentBody() embeds only the
      // first, which is precisely why the comment body cannot be the source of
      // truth for what was attached.
      proofAttachmentSeed("MYS-221", "inspector", 1),
      proofAttachmentSeed("MYS-228", "result"),
      proofAttachmentSeed("MYS-223", "result"),
      {
        // An upload the developer made in the progress composer but never
        // posted. Deliberately 2h old: young enough that the data-retention
        // sweep (24h) keeps it, old enough that it sits outside the rolling
        // hour the upload rate limiter counts.
        id: "seed-ppt-attachment-mys-201-wip",
        linearIssueId: issue("MYS-201").id,
        uploadedById: devId,
        kind: "PROGRESS",
        status: "UPLOADED",
        filename: "MYS-201-wip.png",
        mimeType: "image/png",
        byteSize: 512,
        width: 1,
        height: 1,
        linearAssetUrl:
          "https://uploads.linear.app/devhub/progress-MYS-201/MYS-201-wip.png",
        transport: "dev",
        sortOrder: 0,
        createdAt: hoursAgo(2),
      },
    ],
    skipDuplicates: true,
  });

  // ── Bonus candidates ───────────────────────────────────────────────────────
  const candidate203 = await prisma.bonusCandidate.create({
    data: {
      ...issueColumns(issue("MYS-203")),
      linearIssueStateType: "started",
      linearIssueStateName: "In Progress",
      labels: issue("MYS-203").labelNames,
      estimate: complexity(issue("MYS-203").estimate),
      userId: devId,
      assigneeLinearId: PERSONAS.developer.linearId,
      assigneeEmail: PERSONAS.developer.email,
      assigneeName: PERSONAS.developer.name,
      maxAmount: myr(issue("MYS-203").estimate),
      status: "ELIGIBLE",
      period: monthKey(now),
    },
  });
  await prisma.bonusCandidate.create({
    data: {
      ...issueColumns(issue("MYS-231")),
      linearIssueStateType: "completed",
      linearIssueStateName: "Done",
      labels: issue("MYS-231").labelNames,
      estimate: complexity(issue("MYS-231").estimate),
      userId: devId,
      assigneeLinearId: PERSONAS.developer.linearId,
      assigneeEmail: PERSONAS.developer.email,
      assigneeName: PERSONAS.developer.name,
      maxAmount: myr(issue("MYS-231").estimate),
      status: "READY_FOR_REVIEW",
      period: monthKey(now),
      completedAt: daysAgo(3),
    },
  });
  await prisma.bonusCandidate.create({
    data: {
      ...issueColumns(issue("MYS-232")),
      linearIssueStateType: "completed",
      linearIssueStateName: "Done",
      labels: issue("MYS-232").labelNames,
      estimate: complexity(issue("MYS-232").estimate),
      userId: devId,
      assigneeLinearId: PERSONAS.developer.linearId,
      assigneeEmail: PERSONAS.developer.email,
      assigneeName: PERSONAS.developer.name,
      maxAmount: myr(issue("MYS-232").estimate),
      approvedAmount: 80,
      status: "APPROVED",
      period: monthKey(now),
      completedAt: daysAgo(6),
      reviewedById: adminId,
      reviewedAt: daysAgo(4),
      transactionId: txBonusPending.id,
    },
  });
  await prisma.bonusCandidate.create({
    data: {
      ...issueColumns(issue("MYS-233")),
      linearIssueStateType: "completed",
      linearIssueStateName: "Done",
      labels: issue("MYS-233").labelNames,
      estimate: complexity(issue("MYS-233").estimate),
      userId: bala.userId,
      assigneeLinearId: bala.linearId,
      assigneeEmail: bala.email,
      assigneeName: bala.name,
      maxAmount: myr(issue("MYS-233").estimate),
      status: "REJECTED",
      period: monthKey(now),
      completedAt: daysAgo(9),
      reviewedById: adminId,
      reviewedAt: daysAgo(8),
      rejectionReason: "Routine maintenance work is not bonus-eligible.",
    },
  });
  await prisma.bonusCandidate.create({
    data: {
      ...issueColumns(issue("MYS-220")),
      linearIssueStateType: "completed",
      linearIssueStateName: "Done",
      labels: issue("MYS-220").labelNames,
      estimate: complexity(issue("MYS-220").estimate),
      userId: devId,
      assigneeLinearId: PERSONAS.developer.linearId,
      assigneeEmail: PERSONAS.developer.email,
      assigneeName: PERSONAS.developer.name,
      maxAmount: 0,
      status: "INELIGIBLE",
      ineligibilityReason: "PPT-labeled issues are paid through the PPT flow.",
      period: monthKey(daysAgo(8)),
      completedAt: daysAgo(8),
    },
  });

  // Pre-split leak fixture: an admin notification whose message was rendered
  // with the requester's legal name before the display-name resolver landed.
  // scripts/dev/scrub-legal-name-leaks.ts rewrites this row in dev mode.
  await prisma.notification.create({
    data: {
      userId: adminId,
      actorId: devId,
      domain: "ppt_request",
      type: "SUBMITTED",
      title:
        "New PPT request: Refit traffic light controller for new junction kit",
      message:
        "Alexander Tan Wei Ming requested RM20 for Refit traffic light controller for new junction kit.",
      href: "/dashboard/admin?tab=ppt-requests",
      entityType: "ppt_request",
      entityId: "seed-legacy-ppt-request",
      dedupeKey: "seed:legacy-leak:ppt-request-submitted",
      createdAt: daysAgo(4),
    },
  });

  await prisma.notification.create({
    data: {
      userId: devId,
      domain: "bonus",
      type: "NEW_ELIGIBLE_BONUS",
      title: candidate203.linearIssueTitle ?? "Bonus task",
      message: "Up to RM40 is available for review.",
      href: "/dashboard/bonuses",
      entityType: "bonus_candidate",
      entityId: candidate203.id,
      payload: {
        candidateId: candidate203.id,
        identifier: candidate203.linearIssueIdentifier,
        issueTitle: candidate203.linearIssueTitle,
        amount: candidate203.maxAmount,
        currency: candidate203.currency,
      },
      dedupeKey: `seed:bonus:${candidate203.id}`,
      createdAt: daysAgo(4),
      deliveries: {
        create: {
          channel: "in_app",
          status: "SENT",
          sentAt: daysAgo(4),
          seenAt: daysAgo(4),
          createdAt: daysAgo(4),
        },
      },
    },
  });

  // ── Issue completions & activity (incentives) ──────────────────────────────
  const completedIssues = LINEAR_ISSUES.filter(
    (i) => i.stateType === "completed" && i.completedDaysAgo != null,
  );
  const completionIdByIssueId = new Map<string, string>();
  for (const fixtureIssue of completedIssues) {
    const completedAt = daysAgo(fixtureIssue.completedDaysAgo as number);
    const weekKey = getWeekKey(completedAt);
    const assignee = LINEAR_USERS.find((u) => u.id === fixtureIssue.assigneeId);
    const completion = await prisma.issueCompletion.create({
      data: {
        ...issueColumns(fixtureIssue),
        userId: fixtureIssue.assigneeId
          ? (userIdByLinearId.get(fixtureIssue.assigneeId) ?? null)
          : null,
        assigneeLinearId: fixtureIssue.assigneeId,
        assigneeEmail: assignee?.email ?? null,
        assigneeName: assignee?.name ?? null,
        assigneeAtCompletion: fixtureIssue.assigneeId,
        estimate: complexity(fixtureIssue.estimate),
        labels: fixtureIssue.labelNames,
        hasPptLabel: fixtureIssue.labelNames.includes("PPT"),
        completed: true,
        observedCompletedAt: completedAt,
        linearCompletedAt: completedAt,
        completionEpisode: 1,
        weekKey,
        countedInWeek: weekKey,
        latestLinearStateType: "completed",
        latestLinearStateName: "Done",
        latestLinearUpdatedAt: completedAt,
      },
    });
    completionIdByIssueId.set(fixtureIssue.id, completion.id);
  }

  const activityOffsets = [0, 1, 2, 3, 6, 8, 9, 10];
  await prisma.userActivityDay.createMany({
    data: activityOffsets.map((offset) => ({
      userId: devId,
      activityDate: dateOnlyUtc(daysAgo(offset)),
    })),
  });
  await prisma.userActivityDay.createMany({
    data: [4, 5, 6].map((offset) => ({
      userId: bala.userId,
      activityDate: dateOnlyUtc(daysAgo(offset)),
    })),
  });

  // ── Incentive awards ───────────────────────────────────────────────────────
  const currentWeekKey = getWeekKey(now);
  const prevWeekKey = getWeekKey(daysAgo(7));

  const paidWeeklyAward = await prisma.incentiveAward.create({
    data: {
      userId: devId,
      type: "WEEKLY_THROUGHPUT",
      period: prevWeekKey,
      thresholdMet: 5,
      amount: 30,
      netAmount: 30,
      currency: "MYR",
      status: "PAID",
      transactionId: txIncentivePaid.id,
      claimedAt: daysAgo(8),
      createdAt: daysAgo(9),
    },
  });
  for (const identifier of ["MYS-220", "MYS-227"]) {
    const completionId = completionIdByIssueId.get(issue(identifier).id);
    if (completionId) {
      await prisma.incentiveAwardIssue.create({
        data: { awardId: paidWeeklyAward.id, issueCompletionId: completionId },
      });
    }
  }

  await prisma.incentiveAward.create({
    data: {
      userId: devId,
      type: "STREAK",
      period: prevWeekKey,
      thresholdMet: 4,
      amount: 50,
      currency: "MYR",
      status: "HELD",
      heldReason: "Anomaly check: completion velocity above weekly baseline.",
      createdAt: daysAgo(8),
    },
  });

  // Past releaseAt on a PENDING award → `pnpm simulate cron
  // incentives-release` pays this out (releaseDueIncentives picks up
  // PENDING awards whose releaseAt is due).
  await prisma.incentiveAward.create({
    data: {
      userId: devId,
      type: "MILESTONE",
      period: prevWeekKey,
      thresholdMet: 10,
      detail: { milestone: 10 },
      amount: 25,
      currency: "MYR",
      status: "PENDING",
      releaseAt: new Date(now.getTime() - 60 * 60 * 1000),
      createdAt: daysAgo(7),
    },
  });

  const leaderboardAward = await prisma.incentiveAward.create({
    data: {
      userId: devId,
      type: "LEADERBOARD",
      period: currentWeekKey,
      thresholdMet: 1,
      detail: { rank: 1 },
      amount: 40,
      currency: "MYR",
      status: "PENDING",
      createdAt: daysAgo(1),
    },
  });

  await prisma.notification.create({
    data: {
      userId: devId,
      domain: "incentive",
      type: "NEW_INCENTIVE",
      title: "Leaderboard",
      message: "RM40 is pending release.",
      href: "/dashboard",
      entityType: "incentive_award",
      entityId: leaderboardAward.id,
      payload: {
        awardId: leaderboardAward.id,
        awardType: leaderboardAward.type,
        period: leaderboardAward.period,
        amount: leaderboardAward.amount,
        currency: leaderboardAward.currency,
        status: leaderboardAward.status,
      },
      dedupeKey: `seed:incentive:${leaderboardAward.id}`,
      createdAt: daysAgo(1),
      deliveries: {
        create: {
          channel: "in_app",
          status: "SENT",
          sentAt: daysAgo(1),
          seenAt: daysAgo(1),
          createdAt: daysAgo(1),
        },
      },
    },
  });
  await prisma.incentiveEvent.createMany({
    data: [
      {
        awardId: paidWeeklyAward.id,
        userId: devId,
        type: "AWARD_PAID",
        period: prevWeekKey,
        message: "Weekly throughput award paid out.",
        createdAt: daysAgo(8),
      },
      {
        awardId: leaderboardAward.id,
        userId: devId,
        type: "AWARD_CREATED",
        period: currentWeekKey,
        message: "Leaderboard award created for current week.",
        createdAt: daysAgo(1),
      },
    ],
  });
  await prisma.incentiveClawbackDebt.create({
    data: {
      userId: devId,
      currency: "MYR",
      originalAwardId: paidWeeklyAward.id,
      amount: 10,
      remainingAmount: 10,
      status: "OPEN",
      reason: "MYS-227 reopened after the weekly award was paid.",
      createdAt: daysAgo(5),
    },
  });

  // ── KYC ────────────────────────────────────────────────────────────────────
  const devKyc = await prisma.kycVerification.create({
    data: {
      userId: devId,
      status: "APPROVED",
      legalName: "Alexander Tan Wei Ming",
      documentType: "mykad",
      reviewerId: adminId,
      submittedAt: daysAgo(30),
      reviewedAt: daysAgo(29),
      documentsDeletedAt: daysAgo(22),
      expiresAt: daysAgo(-335),
    },
  });
  await prisma.kycAuditLog.createMany({
    data: [
      {
        verificationId: devKyc.id,
        actorId: devId,
        action: "SUBMITTED",
        createdAt: daysAgo(30),
      },
      {
        verificationId: devKyc.id,
        actorId: adminId,
        action: "APPROVED",
        createdAt: daysAgo(29),
      },
      {
        verificationId: devKyc.id,
        actorId: adminId,
        action: "DOCUMENTS_DELETED",
        details: "Auto-deleted after retention window",
        createdAt: daysAgo(22),
      },
    ],
  });

  const balaKyc = await prisma.kycVerification.create({
    data: {
      userId: bala.userId,
      status: "PENDING",
      legalName: "Balachandran a/l Murugan",
      documentType: "mykad",
      idDocumentBlobUrl: `http://localhost:3000/api/dev/blob/kyc-documents/pending-bala/id.jpg`,
      selfieBlobUrl: `http://localhost:3000/api/dev/blob/kyc-documents/pending-bala/selfie.jpg`,
      submittedAt: daysAgo(2),
      expiresAt: daysAgo(-363),
    },
  });
  await prisma.kycAuditLog.create({
    data: {
      verificationId: balaKyc.id,
      actorId: bala.userId,
      action: "SUBMITTED",
      createdAt: daysAgo(2),
    },
  });

  const meiKyc = await prisma.kycVerification.create({
    data: {
      userId: mei.userId,
      status: "REJECTED",
      legalName: "Chong Mei Ling",
      documentType: "passport",
      rejectionReason: "Document photo too blurry — please resubmit.",
      reviewerId: adminId,
      submittedAt: daysAgo(10),
      reviewedAt: daysAgo(9),
      documentsDeletedAt: daysAgo(9),
      expiresAt: daysAgo(-355),
    },
  });
  await prisma.kycAuditLog.createMany({
    data: [
      {
        verificationId: meiKyc.id,
        actorId: mei.userId,
        action: "SUBMITTED",
        createdAt: daysAgo(10),
      },
      {
        verificationId: meiKyc.id,
        actorId: adminId,
        action: "REJECTED",
        details: "Document photo too blurry",
        createdAt: daysAgo(9),
      },
    ],
  });

  await prisma.kycVerification.create({
    data: {
      userId: ravi.userId,
      status: "EXPIRED",
      legalName: "Ravindran a/l Suppiah",
      documentType: "mykad",
      submittedAt: daysAgo(400),
      reviewedAt: daysAgo(399),
      documentsDeletedAt: daysAgo(30),
      expiresAt: daysAgo(35),
    },
  });

  // ── Signed documents ───────────────────────────────────────────────────────
  for (const [userId, legalName] of [
    [adminId, "Nurul Aina binti Ahmad"],
    [devId, "Alexander Tan Wei Ming"],
  ] as const) {
    for (const documentType of ["COI", "NDA"] as const) {
      const template = getDocumentTemplate(documentType);
      const signedDocument = await prisma.signedDocument.create({
        data: {
          userId,
          documentType,
          templateVersion: template.meta.version,
          templateContent: template.content,
          legalName,
          signedAt: daysAgo(30),
          ipAddress: "127.0.0.1",
        },
      });
      if (documentType === "COI" && userId === devId) {
        await prisma.coiEntry.create({
          data: {
            signedDocumentId: signedDocument.id,
            organizationName: "Freelance commissions (Roblox)",
            natureOfInvolvement: "Occasional paid asset commissions",
            description:
              "Builds vehicle assets for non-competing roleplay communities.",
          },
        });
      }
    }
  }

  // ── Welcome pack ───────────────────────────────────────────────────────────
  const pack = await prisma.welcomePack.create({
    data: {
      name: "MYSverse Founders Welcome Pack",
      description:
        "Welcome merch for active developers — shirt, stickers and lanyard.",
      isActive: true,
      currentWave: 1,
      wave2Open: true,
      defaultDomesticFulfillmentDays: 10,
      defaultInternationalFulfillmentDays: 18,
      defaultDomesticDeliveryDays: 3,
      defaultInternationalDeliveryDays: 12,
      defaultParcelWeightKg: 0.5,
      defaultParcelLengthCm: 30,
      defaultParcelWidthCm: 22,
      defaultParcelHeightCm: 6,
      defaultParcelCurrency: "MYR",
    },
  });
  const [shirtItem, stickerItem, lanyardItem] = await Promise.all([
    prisma.welcomePackItem.create({
      data: {
        packId: pack.id,
        name: "DevHub T-shirt",
        description: "Soft-touch cotton tee with the DevHub crest.",
        requiresSize: true,
        sizeOptions: ["S", "M", "L", "XL", "XXL"],
        customsDescription: "Cotton T-shirt",
        declaredUnitValue: 30,
        hsCode: "6109.10.00",
        displayOrder: 1,
      },
    }),
    prisma.welcomePackItem.create({
      data: {
        packId: pack.id,
        name: "Sticker sheet",
        description: "Die-cut stickers of the MYSverse fleet.",
        customsDescription: "Printed paper stickers",
        declaredUnitValue: 5,
        hsCode: "4911.99.00",
        displayOrder: 2,
      },
    }),
    prisma.welcomePackItem.create({
      data: {
        packId: pack.id,
        name: "Lanyard + ID card",
        description: "Personalised developer ID card with lanyard.",
        customsDescription: "Polyester lanyard with PVC card",
        declaredUnitValue: 8,
        hsCode: "6307.90.00",
        displayOrder: 3,
      },
    }),
  ]);

  await prisma.welcomePackOrder.create({
    data: {
      userId: bala.userId,
      activeUserId: bala.userId,
      packId: pack.id,
      status: "PENDING",
      wave: 1,
      idCardName: "Bala Builder",
      region: "DOMESTIC",
      recipientName: "Balachandran a/l Murugan",
      phone: "+60171234567",
      addressLine1: "88 Jalan Meranti",
      city: "Shah Alam",
      stateProvince: "Selangor",
      postalCode: "40000",
      country: "MY",
      addressIsResidential: true,
      eligibilitySnapshot: {
        wave: 1,
        qualifyingIssues: ["MYS-223"],
        checkedAt: now.toISOString(),
      },
      createdAt: daysAgo(1),
      selections: {
        create: [
          { itemId: shirtItem.id, selectedSize: "L" },
          { itemId: stickerItem.id },
          { itemId: lanyardItem.id },
        ],
      },
      events: {
        create: [
          {
            actorId: bala.userId,
            actorRole: "USER",
            type: "SUBMITTED",
            message: "Order submitted (wave 1)",
            createdAt: daysAgo(1),
          },
        ],
      },
    },
  });
  await prisma.welcomePackOrder.create({
    data: {
      userId: mei.userId,
      activeUserId: mei.userId,
      packId: pack.id,
      status: "SHIPPED",
      wave: 1,
      idCardName: "Mei Mesher",
      region: "DOMESTIC",
      recipientName: "Chong Mei Ling",
      phone: "+60123456789",
      addressLine1: "21 Lorong Kenanga 3",
      city: "George Town",
      stateProvince: "Pulau Pinang",
      postalCode: "10450",
      country: "MY",
      addressIsResidential: true,
      parcelWeightKg: 0.65,
      carrierName: "PosLaju",
      trackingNumber: "MYTRACK123456",
      trackingUrl: "https://tracking.devhub.mock/MYTRACK123456",
      estimatedFulfillmentAt: daysAgo(7),
      estimatedDeliveryAt: daysAgo(-2),
      eligibilitySnapshot: {
        wave: 1,
        qualifyingIssues: ["MYS-224"],
        checkedAt: daysAgo(12).toISOString(),
      },
      createdAt: daysAgo(12),
      approvedAt: daysAgo(10),
      shippedAt: daysAgo(6),
      selections: {
        create: [
          { itemId: shirtItem.id, selectedSize: "M" },
          { itemId: stickerItem.id },
        ],
      },
      events: {
        create: [
          {
            actorId: mei.userId,
            actorRole: "USER",
            type: "SUBMITTED",
            message: "Order submitted (wave 1)",
            createdAt: daysAgo(12),
          },
          {
            actorRole: "ADMIN",
            type: "APPROVED",
            message: "Order approved",
            createdAt: daysAgo(10),
          },
          {
            actorRole: "ADMIN",
            type: "SHIPPED",
            message: "Marked shipped (tracking MYTRACK123456)",
            createdAt: daysAgo(6),
          },
        ],
      },
    },
  });
  const deliveredWelcomePackOrder = await prisma.welcomePackOrder.create({
    data: {
      userId: devId,
      activeUserId: devId,
      packId: pack.id,
      status: "DELIVERED",
      wave: 1,
      idCardName: "Alex Architect",
      region: "DOMESTIC",
      recipientName: "Alexander Tan Wei Ming",
      phone: "+60149876543",
      addressLine1: "12 Jalan Ampang",
      city: "Kuala Lumpur",
      stateProvince: "Kuala Lumpur",
      postalCode: "50450",
      country: "MY",
      addressIsResidential: false,
      carrierName: "DHL eCommerce",
      trackingNumber: "DHLDEVHUB2026",
      trackingUrl: "https://tracking.devhub.mock/DHLDEVHUB2026",
      estimatedFulfillmentAt: daysAgo(18),
      estimatedDeliveryAt: daysAgo(13),
      eligibilitySnapshot: {
        wave: 1,
        qualifyingIssues: ["MYS-221"],
        checkedAt: daysAgo(24).toISOString(),
      },
      createdAt: daysAgo(24),
      approvedAt: daysAgo(22),
      shippedAt: daysAgo(17),
      deliveredAt: daysAgo(13),
      selections: {
        create: [
          { itemId: shirtItem.id, selectedSize: "XL" },
          { itemId: stickerItem.id },
          { itemId: lanyardItem.id },
        ],
      },
      events: {
        create: [
          {
            actorId: devId,
            actorRole: "USER",
            type: "SUBMITTED",
            message: "Order submitted (wave 1)",
            createdAt: daysAgo(24),
          },
          {
            actorRole: "ADMIN",
            type: "APPROVED",
            message: "Order approved; estimated fulfilment in 10 days",
            createdAt: daysAgo(22),
          },
          {
            actorRole: "ADMIN",
            type: "SHIPPED",
            message: "Marked shipped via DHL eCommerce",
            createdAt: daysAgo(17),
          },
          {
            actorRole: "ADMIN",
            type: "DELIVERED",
            message: "Marked delivered",
            createdAt: daysAgo(13),
          },
        ],
      },
    },
  });
  // Retention fixture: a terminal order old enough for the data-retention
  // cron to purge. activeUserId is null because CANCELLED releases the slot,
  // so this coexists with the developer's DELIVERED order above — which stays
  // inside the 90-day window and must NOT be touched, giving the sweep both a
  // positive and a negative case.
  await prisma.welcomePackOrder.create({
    data: {
      userId: devId,
      activeUserId: null,
      packId: pack.id,
      status: "CANCELLED",
      wave: 1,
      idCardName: "Alex Architect",
      region: "DOMESTIC",
      recipientName: "Alexander Tan Wei Ming",
      phone: "+60149876543",
      addressLine1: "88 Jalan Meranti",
      city: "Ipoh",
      stateProvince: "Perak",
      postalCode: "30000",
      country: "MY",
      addressIsResidential: true,
      createdAt: daysAgo(120),
      updatedAt: daysAgo(110),
      selections: { create: [{ itemId: stickerItem.id }] },
      events: {
        create: [
          {
            actorId: devId,
            actorRole: "USER",
            type: "SUBMITTED",
            message: "Order submitted (wave 1)",
            createdAt: daysAgo(120),
          },
          {
            actorId: devId,
            actorRole: "USER",
            type: "SHIPPING_UPDATED",
            message: "Shipping address updated",
            // A real before/after diff, so the sweep has audit metadata to
            // redact — purging the columns alone would leave the old address
            // legible here forever.
            metadata: {
              before: { addressLine1: "1 Jalan Lama", city: "Taiping" },
              after: { addressLine1: "88 Jalan Meranti", city: "Ipoh" },
            },
            createdAt: daysAgo(118),
          },
          {
            actorId: devId,
            actorRole: "USER",
            type: "CANCELLED",
            message: "Order cancelled by developer",
            createdAt: daysAgo(110),
          },
        ],
      },
    },
  });

  await prisma.welcomePackOrder.create({
    data: {
      userId: ravi.userId,
      activeUserId: ravi.userId,
      packId: pack.id,
      status: "APPROVED",
      wave: 2,
      idCardName: "Ravi Rigger",
      region: "INTERNATIONAL",
      recipientName: "Ravindran a/l Suppiah",
      phone: "+6581234567",
      addressLine1: "7 North Bridge Road",
      city: "Singapore",
      stateProvince: "Singapore",
      postalCode: "179094",
      country: "SG",
      addressIsResidential: true,
      taxId: "S1234567D",
      parcelWeightKg: 0.7,
      estimatedFulfillmentAt: daysAgo(2),
      estimatedDeliveryAt: daysAgo(-10),
      delayedAt: daysAgo(1),
      delayReason: "Waiting for the next international courier pickup.",
      logisticsNote: "Batch with other SG orders if possible.",
      eligibilitySnapshot: {
        wave: 2,
        checkedAt: daysAgo(9).toISOString(),
      },
      createdAt: daysAgo(9),
      approvedAt: daysAgo(8),
      selections: {
        create: [
          { itemId: shirtItem.id, selectedSize: "S" },
          { itemId: stickerItem.id },
          { itemId: lanyardItem.id },
        ],
      },
      events: {
        create: [
          {
            actorId: ravi.userId,
            actorRole: "USER",
            type: "SUBMITTED",
            message: "Order submitted (wave 2)",
            createdAt: daysAgo(9),
          },
          {
            actorRole: "ADMIN",
            type: "APPROVED",
            message: "Order approved; estimated fulfilment in 18 days",
            createdAt: daysAgo(8),
          },
          {
            actorRole: "ADMIN",
            type: "DELAYED",
            message: "Order marked delayed",
            metadata: {
              reason: "Waiting for the next international courier pickup.",
            },
            createdAt: daysAgo(1),
          },
        ],
      },
    },
  });
  await prisma.notification.create({
    data: {
      userId: devId,
      domain: "welcome_pack",
      type: "DELIVERED",
      title: "Welcome Pack delivered",
      message: "Your welcome pack was marked as delivered.",
      href: "/dashboard/welcome-pack",
      entityType: "welcome_pack_order",
      entityId: deliveredWelcomePackOrder.id,
      payload: { orderId: deliveredWelcomePackOrder.id },
      dedupeKey: `seed:welcome-pack:${deliveredWelcomePackOrder.id}:delivered`,
      createdAt: daysAgo(13),
      deliveries: {
        create: {
          channel: "in_app",
          status: "SENT",
          sentAt: daysAgo(13),
          seenAt: daysAgo(13),
          createdAt: daysAgo(13),
        },
      },
    },
  });

  // ── PPT requests ───────────────────────────────────────────────────────────
  await prisma.pptRequest.create({
    data: {
      requesterId: devId,
      linearIssueTitle: "Build car wash minigame for petrol stations",
      linearTeamId: LINEAR_TEAM.id,
      linearProjectId: LINEAR_PROJECT.id,
      linearProjectName: LINEAR_PROJECT.name,
      requestedEstimate: 3,
      projectedDueDate: daysAgo(-14),
      description:
        "## Goal\n\nInteractive car wash with cleanliness state and payment hook.\n\n- Add vehicle detection\n- Show foam/water stages\n- Emit a completion event for rewards",
      note: "Good candidate for an open PPT because the scope is self-contained.",
      assigneeIntent: "OPEN",
      status: "PENDING",
      createdAt: daysAgo(1),
      attachments: {
        create: [
          {
            uploadedById: devId,
            filename: "car-wash-reference.png",
            mimeType: "image/png",
            byteSize: 512,
            width: 1,
            height: 1,
            linearAssetUrl:
              "https://uploads.linear.app/devhub/seed/car-wash-reference.png",
            sortOrder: 0,
          },
        ],
      },
    },
  });
  await prisma.pptRequest.create({
    data: {
      requesterId: devId,
      reviewerId: adminId,
      ...issueColumns(issue("MYS-204")),
      linearTeamId: LINEAR_TEAM.id,
      requestedEstimate: 1,
      projectedDueDate: daysAgo(-7),
      status: "APPROVED",
      createdAt: daysAgo(4),
      reviewedAt: daysAgo(3),
    },
  });
  await prisma.pptRequest.create({
    data: {
      requesterId: bala.userId,
      reviewerId: adminId,
      linearIssueTitle: "Re-tile the entire map",
      linearTeamId: LINEAR_TEAM.id,
      requestedEstimate: 5,
      projectedDueDate: daysAgo(-30),
      status: "REJECTED",
      rejectionReason: "Too broad — split into per-district tasks first.",
      createdAt: daysAgo(6),
      reviewedAt: daysAgo(5),
    },
  });

  // ── PPT assignment watch fixtures ─────────────────────────────────────────
  function watchSeed(identifier: string, status: PptAssignmentWatchStatus) {
    const fixtureIssue = issue(identifier);
    if (!fixtureIssue.assigneeId) {
      throw new Error(`${identifier} must be assigned for watch seed data.`);
    }
    const assignee = LINEAR_USERS.find(
      (linearUser) => linearUser.id === fixtureIssue.assigneeId,
    );
    return {
      ...issueColumns(fixtureIssue),
      assigneeLinearId: fixtureIssue.assigneeId,
      assigneeEmail: assignee?.email ?? null,
      assigneeName: assignee?.displayName ?? assignee?.name ?? null,
      userId: userIdByLinearId.get(fixtureIssue.assigneeId) ?? null,
      status,
      assignedAt: daysAgo(fixtureIssue.createdDaysAgo ?? 4),
      metadata: {
        title: fixtureIssue.title,
        description: fixtureIssue.description ?? null,
        estimate: complexity(fixtureIssue.estimate),
        stateType: fixtureIssue.stateType,
        stateName: LINEAR_STATES[fixtureIssue.stateType].name,
        assigneeLinearId: fixtureIssue.assigneeId,
      },
    };
  }
  await prisma.pptAssignmentWatch.createMany({
    data: [
      {
        ...watchSeed("MYS-201", "ACTIVE"),
        lastActivityAt: hoursAgo(16),
      },
      {
        ...watchSeed("MYS-202", "WARNED"),
        lastActivityAt: hoursAgo(54),
        warnedAt: hoursAgo(4),
        warningCount: 1,
        lastLinearCommentAt: hoursAgo(4),
        lastLinearCommentType: "warning",
      },
      {
        ...watchSeed("MYS-204", "BLOCKED"),
        lastActivityAt: hoursAgo(58),
        warnedAt: hoursAgo(8),
        warningCount: 1,
        selfBlockedAt: hoursAgo(6),
        selfBlockReason: "WAITING_REVIEW",
        selfBlockNote: "Waiting for the junction kit design review.",
        selfBlockExpiresAt: hoursAgo(-66),
        selfBlockCount: 1,
      },
      {
        ...watchSeed("MYS-225", "UNASSIGNED"),
        lastActivityAt: hoursAgo(76),
        warnedAt: hoursAgo(28),
        unassignedAt: hoursAgo(1),
        warningCount: 1,
        lastLinearCommentAt: hoursAgo(1),
        lastLinearCommentType: "unassigned",
      },
      {
        ...watchSeed("MYS-220", "RESOLVED"),
        lastActivityAt: daysAgo(8),
        reassignedFromLinearId: null,
        reassignReason: null,
      },
    ],
    skipDuplicates: true,
  });

  // Watch event history so the admin drawer, board chips, and developer
  // timeline all render with data under dev:mock.
  const seededWatches = await prisma.pptAssignmentWatch.findMany({
    select: { id: true, linearIssueId: true, status: true },
  });
  const watchByIssue = new Map(
    seededWatches.map((watch) => [watch.linearIssueId, watch]),
  );
  const watchEventSeeds = [
    { identifier: "MYS-201", type: "CLAIMED" as const, at: hoursAgo(16) },
    { identifier: "MYS-202", type: "CLAIMED" as const, at: hoursAgo(60) },
    { identifier: "MYS-202", type: "WARNED" as const, at: hoursAgo(4) },
    { identifier: "MYS-204", type: "CLAIMED" as const, at: hoursAgo(70) },
    {
      identifier: "MYS-204",
      type: "BLOCKED" as const,
      at: hoursAgo(6),
      note: "Waiting for the junction kit design review.",
    },
    { identifier: "MYS-225", type: "CLAIMED" as const, at: hoursAgo(80) },
    { identifier: "MYS-225", type: "WARNED" as const, at: hoursAgo(28) },
    {
      identifier: "MYS-225",
      type: "AUTO_UNASSIGNED" as const,
      at: hoursAgo(1),
    },
  ];
  for (const eventSeed of watchEventSeeds) {
    const fixtureIssue = issue(eventSeed.identifier);
    const watch = watchByIssue.get(fixtureIssue.id);
    if (!watch) continue;
    await prisma.pptAssignmentWatchEvent.create({
      data: {
        watchId: watch.id,
        linearIssueId: fixtureIssue.id,
        type: eventSeed.type,
        note: eventSeed.note ?? null,
        createdAt: eventSeed.at,
      },
    });
  }

  // ── Achievements (veteran developer persona) ──────────────────────────────
  await prisma.developerAchievement.createMany({
    data: [
      {
        userId: devId,
        key: "FIRST_CLAIM",
        earnedAt: daysAgo(200),
        seenAt: daysAgo(200),
      },
      {
        userId: devId,
        key: "FIRST_PROOF",
        earnedAt: daysAgo(198),
        seenAt: daysAgo(198),
      },
      {
        userId: devId,
        key: "FIRST_PAYOUT",
        earnedAt: daysAgo(197),
        seenAt: daysAgo(197),
      },
    ],
    skipDuplicates: true,
  });

  // ── Invites & email log ────────────────────────────────────────────────────
  await prisma.invite.createMany({
    data: [
      {
        token: "mock-invite-used-0001",
        creatorId: adminId,
        used: true,
        usedById: devId,
        createdAt: daysAgo(300),
      },
      {
        token: "mock-invite-open-0002",
        creatorId: adminId,
        createdAt: daysAgo(2),
      },
    ],
  });

  await prisma.emailDelivery.createMany({
    data: [
      {
        dedupeKey: "mock-email-0001",
        fingerprint: "ppt-ready:MYS-221",
        recipient: PERSONAS.developer.email,
        subject: "Your PPT payout for MYS-221 is ready",
        category: "ppt",
        status: "SENT",
        providerId: "email_mock_0001",
        sentAt: daysAgo(2),
        createdAt: daysAgo(2),
      },
      {
        dedupeKey: "mock-email-0002",
        fingerprint: "kyc-approved",
        recipient: PERSONAS.developer.email,
        subject: "Your identity verification was approved",
        category: "kyc",
        status: "SENT",
        providerId: "email_mock_0002",
        sentAt: daysAgo(29),
        createdAt: daysAgo(29),
      },
      {
        dedupeKey: "mock-email-0003",
        fingerprint: "weekly-digest",
        recipient: PERSONAS.admin.email,
        subject: "PPT admin digest",
        category: "admin-digest",
        status: "FAILED",
        error: "Mock provider unavailable",
        createdAt: daysAgo(1),
      },
    ],
  });

  console.log("[seed] Done. Personas:");
  console.log(`  admin     ${PERSONAS.admin.email}     (id ${adminId})`);
  console.log(`  developer ${PERSONAS.developer.email} (id ${devId})`);
  // PII read-audit fixtures, so the table is not dead on arrival in dev mode.
  await prisma.piiAccessLog.createMany({
    data: [
      {
        actorId: adminId,
        subjectId: devId,
        resource: "KYC_ID_DOCUMENT",
        resourceId: "seed-kyc-verification",
        context: "/api/kyc/document",
        ipAddress: "203.0.113.5",
        userAgent: "Mozilla/5.0 (dev-mode seed)",
        createdAt: daysAgo(3),
      },
      {
        actorId: adminId,
        subjectId: devId,
        resource: "BANK_DETAILS",
        resourceId: "seed-transaction",
        context: "/api/transactions/[id]/pdf",
        createdAt: daysAgo(2),
      },
      {
        actorId: adminId,
        resource: "BANK_DETAILS",
        context: "/dashboard/admin",
        details: "viewed the payout board",
        createdAt: daysAgo(1),
      },
    ],
  });

  console.log("  fresh     fresh@devhub.mock (no profile — onboarding)");
  console.log(
    `  proxy     ${PERSONAS.proxy.email}     (id ${proxyId}, DuitNow passport proxy, no bank)`,
  );
}

async function main() {
  await seed();
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

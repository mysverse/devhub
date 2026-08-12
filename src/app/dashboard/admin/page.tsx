import { Badge, Group, Stack } from "@mantine/core";
import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import LinkButton from "@/components/LinkButton";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import {
  getCurrentUserProfileForAccess,
  hasAdminAccess,
  requireAdminPage,
} from "@/lib/authz";
import { formatBonusPeriod, getBonusConfig } from "@/lib/bonus";
import { getWeeklyUsageForUsers } from "@/lib/credit-limit";
import {
  DISPLAY_NAME_SELECT,
  resolveDisplayName,
  resolveDisplayNameOrNull,
} from "@/lib/display-name";
import { getIncentiveConfig } from "@/lib/incentives";
import { getLinearClient, getLinearServiceClient } from "@/lib/linear";
import { resolveLinearFetchError } from "@/lib/linear-error";
import { fetchIssuesByIds } from "@/lib/linear-queries";
import { selectCampaignBadge } from "@/lib/payout-campaign";
import {
  getLiveCampaignRows,
  toSelectableCampaign,
} from "@/lib/payout-campaign-server";
import { SELF_BLOCK_REASON_LABELS } from "@/lib/payout-policy";
import { logPiiAccess } from "@/lib/pii-audit";
import { getUnassignHours, getWarningHours } from "@/lib/ppt-assignment-watch";
import { getAssignmentWatchTiming } from "@/lib/ppt-assignment-watch-activity";
import { describePptNextStep } from "@/lib/ppt-eligibility";
import prisma from "@/lib/prisma";
import {
  PROFILE_DISPLAY_SELECT,
  PROFILE_PAYOUT_SELECT,
  USER_IDENTITY_SELECT,
} from "@/lib/prisma-select";
import { buildSocialMetadata } from "@/lib/social-previews";
import { getBaseUrl } from "@/lib/url";
import { isXenditEnabled } from "@/lib/xendit";
import type { BonusReviewCandidate } from "./AdminBonusesTab";
import type {
  AdminIncentiveAwardData,
  IncentiveConfigData,
} from "./AdminIncentivesTab";
import AdminPayoutTabs from "./AdminPayoutTabs";
import type { AdminPptAssignmentWatchRow } from "./AdminPptAssignmentWatchTab";
import type { AdminPptEligibilityState } from "./AdminPptEligibilityTab";
import { getBillplzCollectionId } from "./actions";
import BillplzCollectionCard from "./BillplzCollectionCard";
import type { PptRequestData } from "./PptRequestCard";
import type {
  PayoutPaymentDetails,
  PayoutTransaction,
  ProofAttachmentSummary,
} from "./types";

export const metadata: Metadata = buildSocialMetadata("/dashboard/admin");

/**
 * Pending payouts need the payment rails — an admin is about to send money.
 * Settled ones do not, so the columns are never read for the paid/rejected
 * tabs and cannot reach the browser. buildPayoutTransaction() sets
 * paymentDetails to null for those rows.
 */
const PENDING_USER_SELECT = {
  ...PROFILE_DISPLAY_SELECT,
  ...PROFILE_PAYOUT_SELECT,
  linearEmail: true,
} as const satisfies Prisma.UserProfileSelect;

const SETTLED_USER_SELECT = {
  ...PROFILE_DISPLAY_SELECT,
  paymentMethod: true,
} as const satisfies Prisma.UserProfileSelect;

/** BonusCandidate also carries assigneeName/assigneeEmail, which the payout
 *  card never maps — enumerate what is actually used. */
const BONUS_LINE_ITEM_SELECT = {
  id: true,
  linearIssueIdentifier: true,
  linearIssueTitle: true,
  linearIssueUrl: true,
  approvedAmount: true,
} as const satisfies Prisma.BonusCandidateSelect;

/**
 * The PPT proof fields the payout board reads. Named rather than inlined
 * because the same tuple feeds three queries and two payload types, and a
 * field added to only some of them is a type error at best and a silently
 * missing proof body at worst.
 *
 * `proofCommentId` keys the PROOF attachments — NOT `linearIssueId`. A task
 * can accumulate several proof attempts, and keying by issue would show a
 * rejected attempt's screenshots next to the current verdict, on the surface
 * where money is approved. `proofCommentBody` is the comment itself, and is
 * admin-only.
 */
const PPT_PROOF_SELECT = {
  linearIssueId: true,
  status: true,
  reason: true,
  proofCommentId: true,
  proofCommentUrl: true,
  proofCommentBody: true,
} as const satisfies Prisma.PptPayoutStateSelect;

/** The four payout fields the card renders — not the provider request/response
 *  blobs in `providerData`, which are large and admin-debug only. */
const PAYOUT_STATUS_SELECT = {
  id: true,
  provider: true,
  status: true,
  errorMessage: true,
} as const satisfies Prisma.PayoutSelect;

const INCENTIVE_LINE_ITEM_SELECT = {
  id: true,
  type: true,
  period: true,
  amount: true,
  netAmount: true,
  status: true,
} as const satisfies Prisma.IncentiveAwardSelect;

/**
 * Transaction scalars `buildPayoutTransaction()` and `getStoredTaskTitle()`
 * read. Selecting rather than including matters here beyond hygiene: the board
 * loads up to 200 transactions with four relations each, and every column
 * Accelerate has to serialize is CPU and memory on a Cloudflare Worker that
 * gets killed at its limit (P6000/error 1102).
 */
const TRANSACTION_BOARD_SELECT = {
  id: true,
  userId: true,
  amount: true,
  currency: true,
  status: true,
  source: true,
  bonusPeriod: true,
  linearIssueId: true,
  linearIssueIdentifier: true,
  linearIssueTitle: true,
  linearIssueUrl: true,
  paidAt: true,
  rejectedAt: true,
  rejectionReason: true,
  autoApproved: true,
} as const satisfies Prisma.TransactionSelect;

const PENDING_TRANSACTION_SELECT = {
  ...TRANSACTION_BOARD_SELECT,
  user: { select: PENDING_USER_SELECT },
  payout: { select: PAYOUT_STATUS_SELECT },
  bonusCandidates: { select: BONUS_LINE_ITEM_SELECT },
  incentiveAwards: { select: INCENTIVE_LINE_ITEM_SELECT },
  pptPayoutState: { select: PPT_PROOF_SELECT },
} as const satisfies Prisma.TransactionSelect;

const SETTLED_TRANSACTION_SELECT = {
  ...TRANSACTION_BOARD_SELECT,
  user: { select: SETTLED_USER_SELECT },
  payout: { select: PAYOUT_STATUS_SELECT },
  bonusCandidates: { select: BONUS_LINE_ITEM_SELECT },
  incentiveAwards: { select: INCENTIVE_LINE_ITEM_SELECT },
  pptPayoutState: { select: PPT_PROOF_SELECT },
} as const satisfies Prisma.TransactionSelect;

/** Enough of a requester to name them, route the campaign badge, and reach
 *  them — never the payout rails, which this board does not render. */
const PPT_REQUEST_REQUESTER_SELECT = {
  ...PROFILE_DISPLAY_SELECT,
  linearId: true,
  developerRank: true,
  user: { select: USER_IDENTITY_SELECT },
} as const satisfies Prisma.UserProfileSelect;

const PPT_REQUEST_BOARD_SELECT = {
  id: true,
  linearIssueId: true,
  linearIssueIdentifier: true,
  linearIssueTitle: true,
  linearIssueUrl: true,
  linearTeamId: true,
  linearProjectId: true,
  linearProjectName: true,
  requestedEstimate: true,
  projectedDueDate: true,
  description: true,
  note: true,
  assigneeIntent: true,
  intendedAssigneeLinearId: true,
  intendedAssigneeName: true,
  intendedAssigneeEmail: true,
  createdAt: true,
  requester: { select: PPT_REQUEST_REQUESTER_SELECT },
  attachments: {
    select: {
      id: true,
      filename: true,
      mimeType: true,
      byteSize: true,
      width: true,
      height: true,
    },
    orderBy: { sortOrder: "asc" },
  },
} as const satisfies Prisma.PptRequestSelect;

const INCENTIVE_AWARD_BOARD_SELECT = {
  id: true,
  type: true,
  period: true,
  thresholdMet: true,
  amount: true,
  netAmount: true,
  clawbackApplied: true,
  currency: true,
  status: true,
  heldReason: true,
  releaseAt: true,
  createdAt: true,
  transactionId: true,
  user: { select: PROFILE_DISPLAY_SELECT },
  awardIssues: {
    select: {
      issueCompletion: {
        select: {
          id: true,
          linearIssueIdentifier: true,
          linearIssueTitle: true,
          linearIssueUrl: true,
        },
      },
    },
  },
} as const satisfies Prisma.IncentiveAwardSelect;

const BONUS_CANDIDATE_BOARD_SELECT = {
  id: true,
  userId: true,
  currency: true,
  period: true,
  linearIssueIdentifier: true,
  linearIssueTitle: true,
  linearIssueUrl: true,
  labels: true,
  estimate: true,
  maxAmount: true,
  completedAt: true,
  assigneeName: true,
  assigneeEmail: true,
  user: {
    select: {
      ...PROFILE_DISPLAY_SELECT,
      user: { select: USER_IDENTITY_SELECT },
    },
  },
} as const satisfies Prisma.BonusCandidateSelect;

const PPT_PAYOUT_STATE_BOARD_SELECT = {
  id: true,
  linearIssueId: true,
  linearIssueIdentifier: true,
  linearIssueTitle: true,
  linearIssueUrl: true,
  assigneeEmail: true,
  assigneeName: true,
  status: true,
  reason: true,
  completionEpisode: true,
  proofCommentId: true,
  proofCommentUrl: true,
  proofCommentBody: true,
  proofOverride: true,
  proofOverrideById: true,
  proofOverrideNote: true,
  warningCount: true,
  updatedAt: true,
  user: { select: PROFILE_DISPLAY_SELECT },
  transaction: {
    select: { status: true, payout: { select: { status: true } } },
  },
  events: {
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      type: true,
      reason: true,
      message: true,
      createdAt: true,
    },
  },
} as const satisfies Prisma.PptPayoutStateSelect;

/** The heaviest query on the board — up to 250 rows, each previously carrying
 *  a whole UserProfile to render one name. */
const PPT_ASSIGNMENT_WATCH_BOARD_SELECT = {
  id: true,
  linearIssueId: true,
  linearIssueIdentifier: true,
  linearIssueTitle: true,
  linearIssueUrl: true,
  assigneeName: true,
  assigneeEmail: true,
  status: true,
  assignedAt: true,
  lastActivityAt: true,
  warnedAt: true,
  unassignedAt: true,
  snoozedUntil: true,
  snoozeReason: true,
  warningCount: true,
  selfBlockCount: true,
  selfBlockReason: true,
  selfBlockNote: true,
  selfBlockExpiresAt: true,
  releasedBySelfAt: true,
  reassignReason: true,
  lastAdminActionAt: true,
  lastAdminActionById: true,
  lastAdminActionNote: true,
  user: { select: PROFILE_DISPLAY_SELECT },
} as const satisfies Prisma.PptAssignmentWatchSelect;

type PendingTransaction = Prisma.TransactionGetPayload<{
  select: typeof PENDING_TRANSACTION_SELECT;
}>;

type SettledTransaction = Prisma.TransactionGetPayload<{
  select: typeof SETTLED_TRANSACTION_SELECT;
}>;

type TransactionWithUser = PendingTransaction | SettledTransaction;

function buildPayoutTransaction(
  tx: TransactionWithUser,
  taskTitle: string,
  proofAttachmentsByComment: Map<string, ProofAttachmentSummary[]>,
  creditLimitUsage?: { used: number; limit: number; remaining: number } | null,
): PayoutTransaction {
  const { user } = tx;
  const proofCommentId = tx.pptPayoutState?.proofCommentId;
  // Only pending rows carry the rails; the settled queries do not select them.
  const paymentDetails: PayoutPaymentDetails | null =
    "bankAccountNumber" in user
      ? {
          paypalEmail: user.paypalEmail,
          duitNowId: user.duitNowId,
          bankName: user.bankName,
          bankAccountNumber: user.bankAccountNumber,
          bankAccountName: user.bankAccountName,
          robloxId: user.robloxId,
          robuxUsername: user.robuxUsername,
          email: user.linearEmail,
        }
      : null;
  return {
    id: tx.id,
    userId: user.id,
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    source: tx.source,
    bonusPeriod: tx.bonusPeriod,
    taskTitle,
    developerName: resolveDisplayName({ profile: user }),
    paymentMethod: user.paymentMethod,
    paymentDetails,
    linearIssueIdentifier: tx.linearIssueIdentifier,
    linearIssueId: tx.linearIssueId,
    linearIssueUrl: tx.linearIssueUrl,
    paidAt: tx.paidAt?.toISOString() ?? null,
    rejectedAt: tx.rejectedAt?.toISOString() ?? null,
    rejectionReason: tx.rejectionReason,
    autoApproved: tx.autoApproved,
    proofStatus: tx.pptPayoutState?.status ?? null,
    proofReason: tx.pptPayoutState?.reason ?? null,
    proofCommentUrl: tx.pptPayoutState?.proofCommentUrl ?? null,
    proofBody: tx.pptPayoutState?.proofCommentBody ?? null,
    proofAttachments: proofCommentId
      ? (proofAttachmentsByComment.get(proofCommentId) ?? [])
      : [],
    bonusLineItems: tx.bonusCandidates.map((candidate) => ({
      id: candidate.id,
      identifier: candidate.linearIssueIdentifier,
      title: candidate.linearIssueTitle,
      url: candidate.linearIssueUrl,
      amount: candidate.approvedAmount,
    })),
    incentiveLineItems: tx.incentiveAwards.map((award) => ({
      id: award.id,
      type: award.type,
      period: award.period,
      amount: award.amount,
      netAmount: award.netAmount,
      status: award.status,
    })),
    payout: tx.payout
      ? {
          id: tx.payout.id,
          provider: tx.payout.provider,
          status: tx.payout.status,
          errorMessage: tx.payout.errorMessage,
        }
      : null,
    creditLimitUsage: creditLimitUsage ?? null,
    xenditEnabled: isXenditEnabled(),
  };
}

function getStoredTaskTitle(tx: TransactionWithUser) {
  if (tx.source === "BONUS") {
    return (
      tx.linearIssueTitle ||
      `${formatBonusPeriod(tx.bonusPeriod)} Bonus - ${tx.bonusCandidates.length} task${tx.bonusCandidates.length === 1 ? "" : "s"}`
    );
  }

  if (tx.source === "INCENTIVE") {
    return (
      tx.linearIssueTitle ||
      `Incentive Awards - ${tx.incentiveAwards.length} item${tx.incentiveAwards.length === 1 ? "" : "s"}`
    );
  }

  return tx.linearIssueTitle
    ? `${tx.linearIssueIdentifier} - ${tx.linearIssueTitle}`
    : tx.linearIssueIdentifier || "Manual Payout";
}

export default function AdminPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Admin Payouts"
        subtitle="Review and manage developer payouts."
        action={
          <Group>
            <LinkButton href="/dashboard/admin/suggest" variant="light">
              Suggest a Task
            </LinkButton>
            <LinkButton href="/dashboard/admin/users" variant="light">
              Team Members
            </LinkButton>
            <LinkButton href="/dashboard/admin/access" variant="light">
              Access
            </LinkButton>
            <LinkButton href="/dashboard/admin/documents" variant="light">
              Document Compliance
            </LinkButton>
            <LinkButton href="/dashboard/admin/kyc" variant="light">
              KYC Review
              <Suspense fallback={null}>
                <PendingKycBadge />
              </Suspense>
            </LinkButton>
            <LinkButton href="/dashboard/admin/welcome-pack" variant="light">
              Welcome Pack
            </LinkButton>
            <LinkButton href="/dashboard/admin/campaigns" variant="light">
              Campaigns
            </LinkButton>
          </Group>
        }
      />
      <Suspense fallback={<PageSkeleton cards={4} withHeader={false} />}>
        <AdminPageContent />
      </Suspense>
    </PageContainer>
  );
}

async function PendingKycBadge() {
  // Cache Components: defer to request time before hitting the database —
  // unlike AdminPageContent this subtree reads no request data of its own,
  // so without this the build-time prerender rejects the uncached query.
  await connection();
  // This is a SIBLING Suspense subtree to AdminPageContent, so that component's
  // requireAdminPage() does not gate it — without this check the pending-KYC
  // count streams to any authenticated user. Return null rather than redirect:
  // a decorative badge must not navigate the page.
  const { profile } = await getCurrentUserProfileForAccess();
  if (!hasAdminAccess(profile)) return null;
  const pendingKycCount = await prisma.kycVerification.count({
    where: { status: "PENDING" },
  });
  if (pendingKycCount === 0) return null;
  return (
    <Badge size="sm" circle ml={4}>
      {pendingKycCount}
    </Badge>
  );
}

async function AdminPageContent() {
  const userId = await requireAdminPage();
  // One aggregate row per render, not one per transaction: the board shows up
  // to 100 pending rows, and per-row logging would bury the precise entries
  // written by the KYC and slip routes under thousands of page-view rows.
  await logPiiAccess({
    actorId: userId,
    resource: "BANK_DETAILS",
    context: "/dashboard/admin",
    details: "viewed the payout board",
  });
  const recentWatchHistoryCutoff = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  );
  // Resolved per requester below: an admin approving a request should see the
  // amount that developer was quoted, not the base rate.
  const liveCampaignRows = (await getLiveCampaignRows()).map(
    toSelectableCampaign,
  );

  const [
    pendingTransactions,
    paidTransactions,
    rejectedTransactions,
    pendingPptRequests,
    bonusConfig,
    incentiveConfig,
    incentiveAwards,
    readyBonusCandidates,
    pptPayoutStates,
    pptAssignmentWatches,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: { in: ["PENDING", "ON_HOLD"] } },
      select: PENDING_TRANSACTION_SELECT,
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.transaction.findMany({
      where: { status: "PAID" },
      select: SETTLED_TRANSACTION_SELECT,
      orderBy: { paidAt: "desc" },
      take: 50,
    }),
    prisma.transaction.findMany({
      where: { status: "REJECTED" },
      select: SETTLED_TRANSACTION_SELECT,
      orderBy: { rejectedAt: "desc" },
      take: 50,
    }),
    prisma.pptRequest.findMany({
      where: { status: "PENDING" },
      select: PPT_REQUEST_BOARD_SELECT,
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    getBonusConfig(),
    getIncentiveConfig(),
    prisma.incentiveAward.findMany({
      select: INCENTIVE_AWARD_BOARD_SELECT,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.bonusCandidate.findMany({
      where: { status: "READY_FOR_REVIEW" },
      select: BONUS_CANDIDATE_BOARD_SELECT,
      orderBy: [{ period: "asc" }, { completedAt: "asc" }],
      take: 100,
    }),
    prisma.pptPayoutState.findMany({
      where: {
        OR: [
          {
            status: {
              in: [
                "BLOCKED",
                "NEEDS_PROOF",
                "WAITING_STABILITY",
                "ON_HOLD",
                "FLAGGED",
              ],
            },
          },
          {
            updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        ],
      },
      select: PPT_PAYOUT_STATE_BOARD_SELECT,
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.pptAssignmentWatch.findMany({
      where: {
        OR: [
          {
            status: {
              in: ["ACTIVE", "WARNED", "SNOOZED", "BLOCKED", "UNASSIGNED"],
            },
          },
          { status: "RESOLVED", updatedAt: { gte: recentWatchHistoryCutoff } },
        ],
      },
      select: PPT_ASSIGNMENT_WATCH_BOARD_SELECT,
      orderBy: { updatedAt: "desc" },
      take: 250,
    }),
  ]);

  const { redisId, envId } = await getBillplzCollectionId();
  const currentCollectionId = redisId || envId;
  const collectionSource: "redis" | "env" | "none" = redisId
    ? "redis"
    : envId
      ? "env"
      : "none";
  const callbackUrl = `${getBaseUrl()}/api/webhooks/billplz`;

  // Proof attachments for everything the board renders — the payout cards and
  // the eligibility tab both show them, so they are fetched once for the union
  // of proof comment ids rather than per card.
  //
  // Keyed on `linearCommentId`, and `postedAt` must be set. Two states are
  // deliberately excluded because neither is evidence for the proof being
  // reviewed:
  //   - UPLOADED: an upload that never made it into a comment at all.
  //   - POSTED with a null postedAt: the claim succeeded but the invocation
  //     died before `createComment` returned, so the release never ran. Showing
  //     those would put screenshots from a comment that does not exist next to
  //     the override button.
  const proofCommentIds = [
    ...new Set(
      [...pendingTransactions, ...paidTransactions, ...rejectedTransactions]
        .map((tx) => tx.pptPayoutState?.proofCommentId)
        // The eligibility tab overlaps heavily with the payout tabs, so the
        // dedupe has to span both sources, not just the transactions.
        .concat(pptPayoutStates.map((state) => state.proofCommentId)),
    ),
  ].filter((commentId): commentId is string => Boolean(commentId));
  const proofAttachmentRows =
    proofCommentIds.length > 0
      ? await prisma.pptCommentAttachment.findMany({
          where: {
            linearCommentId: { in: proofCommentIds },
            kind: "PROOF",
            status: "POSTED",
            postedAt: { not: null },
          },
          select: {
            id: true,
            linearCommentId: true,
            filename: true,
            mimeType: true,
            byteSize: true,
            width: true,
            height: true,
          },
          orderBy: [{ postedAt: "asc" }, { sortOrder: "asc" }],
        })
      : [];
  const proofAttachmentsByComment = new Map<string, ProofAttachmentSummary[]>();
  for (const row of proofAttachmentRows) {
    if (!row.linearCommentId) continue;
    const summary: ProofAttachmentSummary = {
      id: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      width: row.width,
      height: row.height,
    };
    const existing = proofAttachmentsByComment.get(row.linearCommentId);
    if (existing) existing.push(summary);
    else proofAttachmentsByComment.set(row.linearCommentId, [summary]);
  }

  // Compute credit limit usage per unique userId+currency for pending transactions
  const creditUsageMap = await getWeeklyUsageForUsers(
    pendingTransactions
      .filter((tx) => tx.source === "PPT")
      .map((tx) => ({
        userId: tx.userId,
        currency: tx.currency === "ROBUX" ? "ROBUX" : "MYR",
      })),
  );

  const missingLinearTitleIssueIds = [
    ...new Set(
      pendingTransactions
        .filter(
          (tx) =>
            tx.source === "PPT" &&
            tx.linearIssueId &&
            !tx.linearIssueId.includes(" ") &&
            !tx.linearIssueTitle,
        )
        .map((tx) => tx.linearIssueId as string),
    ),
  ];
  const linearIssueTitles = new Map<string, string>();
  if (missingLinearTitleIssueIds.length > 0) {
    try {
      const linearClient =
        getLinearServiceClient() ?? (await getLinearClient(userId));
      const issues = await fetchIssuesByIds(
        linearClient,
        missingLinearTitleIssueIds,
      );
      for (const issue of issues) {
        linearIssueTitles.set(issue.id, `${issue.identifier} - ${issue.title}`);
      }
    } catch (e) {
      resolveLinearFetchError(e, "/dashboard/admin", "admin issue titles");
    }
  }

  // Enrich pending transactions with Linear issue details
  const pending: PayoutTransaction[] = await Promise.all(
    pendingTransactions.map(async (tx: TransactionWithUser) => {
      let taskTitle = getStoredTaskTitle(tx);

      if (
        tx.source === "PPT" &&
        tx.linearIssueId &&
        !tx.linearIssueId.includes(" ") &&
        !tx.linearIssueTitle
      ) {
        taskTitle = linearIssueTitles.get(tx.linearIssueId) ?? taskTitle;
      }

      const creditUsage = creditUsageMap.get(`${tx.userId}:${tx.currency}`);
      return buildPayoutTransaction(
        tx,
        taskTitle,
        proofAttachmentsByComment,
        creditUsage,
      );
    }),
  );

  // For paid/rejected, use stored titles (no Linear API calls)
  const paid: PayoutTransaction[] = paidTransactions.map(
    (tx: TransactionWithUser) =>
      buildPayoutTransaction(
        tx,
        getStoredTaskTitle(tx),
        proofAttachmentsByComment,
      ),
  );

  const rejected: PayoutTransaction[] = rejectedTransactions.map(
    (tx: TransactionWithUser) =>
      buildPayoutTransaction(
        tx,
        getStoredTaskTitle(tx),
        proofAttachmentsByComment,
      ),
  );

  const bonusCandidates: BonusReviewCandidate[] = readyBonusCandidates
    .filter((candidate) => candidate.user)
    .map((candidate) => ({
      id: candidate.id,
      userId: candidate.userId as string,
      developerName: resolveDisplayName({
        profile: candidate.user,
        storedLinearName: candidate.assigneeName,
      }),
      developerEmail:
        candidate.user?.user.email || candidate.assigneeEmail || null,
      currency: candidate.currency,
      period: candidate.period || new Date().toISOString().slice(0, 7),
      linearIssueIdentifier: candidate.linearIssueIdentifier,
      linearIssueTitle: candidate.linearIssueTitle,
      linearIssueUrl: candidate.linearIssueUrl,
      labels: candidate.labels,
      estimate: candidate.estimate,
      maxAmount: candidate.maxAmount,
      completedAt: candidate.completedAt?.toISOString() ?? null,
    }));

  const incentiveConfigData: IncentiveConfigData = {
    enabled: incentiveConfig.enabled,
    activatedAt: incentiveConfig.activatedAt?.toISOString() ?? null,
    weeklyEnabled: incentiveConfig.weeklyEnabled,
    weeklyThreshold: incentiveConfig.weeklyThreshold,
    weeklyMyrAmount: incentiveConfig.weeklyMyrAmount,
    weeklyRobuxAmount: incentiveConfig.weeklyRobuxAmount,
    streakEnabled: incentiveConfig.streakEnabled,
    streakThresholdWeeks: incentiveConfig.streakThresholdWeeks,
    streakMyrAmount: incentiveConfig.streakMyrAmount,
    streakRobuxAmount: incentiveConfig.streakRobuxAmount,
    milestoneEnabled: incentiveConfig.milestoneEnabled,
    milestonesText: incentiveConfig.milestones
      ? JSON.stringify(incentiveConfig.milestones, null, 2)
      : "",
    leaderboardEnabled: incentiveConfig.leaderboardEnabled,
    leaderboardTopN: incentiveConfig.leaderboardTopN,
    leaderboardMyrAmount: incentiveConfig.leaderboardMyrAmount,
    leaderboardRobuxAmount: incentiveConfig.leaderboardRobuxAmount,
    activeDayKickerEnabled: incentiveConfig.activeDayKickerEnabled,
    activeDayThreshold: incentiveConfig.activeDayThreshold,
    activeDayKickerMyr: incentiveConfig.activeDayKickerMyr,
    activeDayKickerRobux: incentiveConfig.activeDayKickerRobux,
    minEstimateToCount: incentiveConfig.minEstimateToCount,
    excludedLabels: incentiveConfig.excludedLabels,
    stabilityMinutes: incentiveConfig.stabilityMinutes,
    disputeWindowHours: incentiveConfig.disputeWindowHours,
    autoPayout: incentiveConfig.autoPayout,
    perUserWeeklyCapMyr: incentiveConfig.perUserWeeklyCapMyr,
    perUserWeeklyCapRobux: incentiveConfig.perUserWeeklyCapRobux,
    perUserMonthlyCapMyr: incentiveConfig.perUserMonthlyCapMyr,
    perUserMonthlyCapRobux: incentiveConfig.perUserMonthlyCapRobux,
    programWeeklyBudgetMyr: incentiveConfig.programWeeklyBudgetMyr,
    programWeeklyBudgetRobux: incentiveConfig.programWeeklyBudgetRobux,
    programMonthlyBudgetMyr: incentiveConfig.programMonthlyBudgetMyr,
    programMonthlyBudgetRobux: incentiveConfig.programMonthlyBudgetRobux,
    anomalyMultiplier: incentiveConfig.anomalyMultiplier,
    anomalyMinBaselineWeeks: incentiveConfig.anomalyMinBaselineWeeks,
    noEstimateRatioFlag: incentiveConfig.noEstimateRatioFlag,
    clawbackMode: incentiveConfig.clawbackMode,
  };

  const incentiveAwardRows: AdminIncentiveAwardData[] = incentiveAwards.map(
    (award) => ({
      id: award.id,
      developerName: resolveDisplayName({ profile: award.user }),
      type: award.type,
      period: award.period,
      thresholdMet: award.thresholdMet,
      amount: award.amount,
      netAmount: award.netAmount,
      clawbackApplied: award.clawbackApplied,
      currency: award.currency,
      status: award.status,
      heldReason: award.heldReason,
      releaseAt: award.releaseAt?.toISOString() ?? null,
      createdAt: award.createdAt.toISOString(),
      transactionId: award.transactionId,
      issues: award.awardIssues.map(({ issueCompletion }) => ({
        id: issueCompletion.id,
        identifier: issueCompletion.linearIssueIdentifier,
        title: issueCompletion.linearIssueTitle,
        url: issueCompletion.linearIssueUrl,
      })),
    }),
  );

  const proofOverrideByIds = [
    ...new Set(
      pptPayoutStates
        .map((state) => state.proofOverrideById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const proofOverrideProfiles =
    proofOverrideByIds.length > 0
      ? await prisma.userProfile.findMany({
          where: { id: { in: proofOverrideByIds } },
          select: { id: true, ...DISPLAY_NAME_SELECT },
        })
      : [];
  const proofOverrideNameById = new Map(
    proofOverrideProfiles.map((profile) => [
      profile.id,
      resolveDisplayName({ profile }),
    ]),
  );

  const assignmentWatchAdminIds = [
    ...new Set(
      pptAssignmentWatches
        .map((watch) => watch.lastAdminActionById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const assignmentWatchAdminProfiles =
    assignmentWatchAdminIds.length > 0
      ? await prisma.userProfile.findMany({
          where: { id: { in: assignmentWatchAdminIds } },
          select: { id: true, ...DISPLAY_NAME_SELECT },
        })
      : [];
  const assignmentWatchAdminNameById = new Map(
    assignmentWatchAdminProfiles.map((profile) => [
      profile.id,
      resolveDisplayName({ profile }),
    ]),
  );
  const warningHours = getWarningHours();
  const unassignHours = getUnassignHours();
  const watchStatusPriority = new Map([
    ["ACTIVE", 0],
    ["WARNED", 1],
    ["BLOCKED", 2],
    ["SNOOZED", 3],
    ["UNASSIGNED", 4],
    ["RESOLVED", 5],
  ]);
  const pptAssignmentWatchRows: AdminPptAssignmentWatchRow[] =
    pptAssignmentWatches
      .map((watch) => {
        const timing = getAssignmentWatchTiming({
          lastActivityAt: watch.lastActivityAt,
          status: watch.status,
          snoozedUntil: watch.snoozedUntil,
          selfBlockExpiresAt: watch.selfBlockExpiresAt,
          warningHours,
          unassignHours,
        });
        return {
          id: watch.id,
          linearIssueId: watch.linearIssueId,
          linearIssueIdentifier: watch.linearIssueIdentifier,
          linearIssueTitle: watch.linearIssueTitle,
          linearIssueUrl: watch.linearIssueUrl,
          assigneeName: watch.assigneeName,
          assigneeEmail: watch.assigneeEmail,
          developerName: resolveDisplayNameOrNull({
            profile: watch.user,
            storedLinearName: watch.assigneeName,
          }),
          status: watch.status,
          assignedAt: watch.assignedAt.toISOString(),
          lastActivityAt: watch.lastActivityAt.toISOString(),
          warnedAt: watch.warnedAt?.toISOString() ?? null,
          unassignedAt: watch.unassignedAt?.toISOString() ?? null,
          snoozedUntil: watch.snoozedUntil?.toISOString() ?? null,
          snoozeReason: watch.snoozeReason,
          warningCount: watch.warningCount,
          warningAt: timing.warningAt.toISOString(),
          unassignAt: timing.unassignAt.toISOString(),
          staleHours: timing.staleHours,
          dueWithin24Hours: timing.dueWithin24Hours,
          selfBlockCount: watch.selfBlockCount,
          selfBlockReasonLabel: watch.selfBlockReason
            ? (SELF_BLOCK_REASON_LABELS[watch.selfBlockReason] ?? null)
            : null,
          selfBlockNote: watch.selfBlockNote,
          selfBlockExpiresAt: watch.selfBlockExpiresAt?.toISOString() ?? null,
          releasedBySelfAt: watch.releasedBySelfAt?.toISOString() ?? null,
          reassignReason: watch.reassignReason,
          lastAdminActionAt: watch.lastAdminActionAt?.toISOString() ?? null,
          lastAdminActionByName: watch.lastAdminActionById
            ? (assignmentWatchAdminNameById.get(watch.lastAdminActionById) ??
              null)
            : null,
          lastAdminActionNote: watch.lastAdminActionNote,
        };
      })
      .sort((left, right) => {
        const priorityDelta =
          (watchStatusPriority.get(left.status) ?? 99) -
          (watchStatusPriority.get(right.status) ?? 99);
        if (priorityDelta !== 0) return priorityDelta;
        return (
          new Date(right.lastActivityAt).getTime() -
          new Date(left.lastActivityAt).getTime()
        );
      });

  const pptEligibilityStates: AdminPptEligibilityState[] = pptPayoutStates.map(
    (state) => {
      const nextStep = describePptNextStep(state.status, state.reason);

      return {
        id: state.id,
        linearIssueId: state.linearIssueId,
        linearIssueIdentifier: state.linearIssueIdentifier,
        linearIssueTitle: state.linearIssueTitle,
        linearIssueUrl: state.linearIssueUrl,
        developerName: resolveDisplayNameOrNull({
          profile: state.user,
          storedLinearName: state.assigneeName,
        }),
        assigneeEmail: state.assigneeEmail,
        status: state.status,
        reason: state.reason,
        owner: nextStep.owner,
        nextStep: nextStep.action,
        completionEpisode: state.completionEpisode,
        proofCommentUrl: state.proofCommentUrl,
        proofBody: state.proofCommentBody,
        proofAttachments: state.proofCommentId
          ? (proofAttachmentsByComment.get(state.proofCommentId) ?? [])
          : [],
        proofOverride: state.proofOverride,
        proofOverrideNote: state.proofOverrideNote,
        proofOverrideByName: state.proofOverrideById
          ? (proofOverrideNameById.get(state.proofOverrideById) ?? null)
          : null,
        transactionStatus: state.transaction?.status ?? null,
        payoutStatus: state.transaction?.payout?.status ?? null,
        warningCount: state.warningCount,
        updatedAt: state.updatedAt.toISOString(),
        events: state.events.map((event) => ({
          id: event.id,
          type: event.type,
          reason: event.reason,
          message: event.message,
          createdAt: event.createdAt.toISOString(),
        })),
      };
    },
  );

  return (
    <Stack gap="xl">
      <BillplzCollectionCard
        currentCollectionId={currentCollectionId}
        source={collectionSource}
        callbackUrl={callbackUrl}
      />

      <AdminPayoutTabs
        pending={pending}
        paid={paid}
        rejected={rejected}
        bonusConfig={{
          enabled: bonusConfig.enabled,
          myrRatePerPoint: bonusConfig.myrRatePerPoint,
          robuxRatePerPoint: bonusConfig.robuxRatePerPoint,
          excludedLabels: bonusConfig.excludedLabels,
        }}
        bonusCandidates={bonusCandidates}
        incentiveConfig={incentiveConfigData}
        incentiveAwards={incentiveAwardRows}
        pptAssignmentWatches={pptAssignmentWatchRows}
        pptEligibilityStates={pptEligibilityStates}
        pptRequests={pendingPptRequests.map(
          (req): PptRequestData => ({
            campaign: selectCampaignBadge(liveCampaignRows, {
              scope: "PPT",
              userId: req.requester.id,
              rank: req.requester.developerRank,
            }),
            id: req.id,
            requesterName: resolveDisplayName({ profile: req.requester }),
            requesterEmail: req.requester.user.email,
            requesterLinearId: req.requester.linearId,
            linearIssueId: req.linearIssueId,
            linearIssueIdentifier: req.linearIssueIdentifier,
            linearIssueTitle: req.linearIssueTitle,
            linearIssueUrl: req.linearIssueUrl,
            linearTeamId: req.linearTeamId,
            linearProjectId: req.linearProjectId,
            linearProjectName: req.linearProjectName,
            requestedEstimate: req.requestedEstimate,
            projectedDueDate: req.projectedDueDate.toISOString(),
            description: req.description,
            note: req.note,
            assigneeIntent: req.assigneeIntent,
            intendedAssigneeLinearId: req.intendedAssigneeLinearId,
            intendedAssigneeName: req.intendedAssigneeName,
            intendedAssigneeEmail: req.intendedAssigneeEmail,
            attachments: req.attachments.map((attachment) => ({
              id: attachment.id,
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              byteSize: attachment.byteSize,
              width: attachment.width,
              height: attachment.height,
            })),
            createdAt: req.createdAt.toISOString(),
          }),
        )}
      />
    </Stack>
  );
}

import { Badge, Group, Stack } from "@mantine/core";
import type { Payout, Transaction, UserProfile } from "@prisma/client";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import LinkButton from "@/components/LinkButton";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { requireAdminPage } from "@/lib/authz";
import { formatBonusPeriod, getBonusConfig } from "@/lib/bonus";
import { getWeeklyUsageForUsers } from "@/lib/credit-limit";
import { getIncentiveConfig } from "@/lib/incentives";
import { getLinearClient, getLinearServiceClient } from "@/lib/linear";
import { resolveLinearFetchError } from "@/lib/linear-error";
import { fetchIssuesByIds } from "@/lib/linear-queries";
import { describePptNextStep } from "@/lib/ppt-eligibility";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import { getBaseUrl } from "@/lib/url";
import { isXenditEnabled } from "@/lib/xendit";
import type { BonusReviewCandidate } from "./AdminBonusesTab";
import type {
  AdminIncentiveAwardData,
  IncentiveConfigData,
} from "./AdminIncentivesTab";
import AdminPayoutTabs from "./AdminPayoutTabs";
import type { AdminPptEligibilityState } from "./AdminPptEligibilityTab";
import { getBillplzCollectionId } from "./actions";
import BillplzCollectionCard from "./BillplzCollectionCard";
import type { PptRequestData } from "./PptRequestCard";
import type { PayoutTransaction } from "./types";

export const metadata: Metadata = buildSocialMetadata("/dashboard/admin");

type TransactionWithUser = Transaction & {
  user: UserProfile;
  payout: Payout | null;
  pptPayoutState: {
    status: string;
    reason: string | null;
    proofCommentUrl: string | null;
  } | null;
  bonusCandidates: {
    id: string;
    linearIssueIdentifier: string | null;
    linearIssueTitle: string | null;
    linearIssueUrl: string | null;
    approvedAmount: number | null;
  }[];
  incentiveAwards: {
    id: string;
    type: string;
    period: string;
    amount: number;
    netAmount: number | null;
    status: string;
  }[];
};

function buildPayoutTransaction(
  tx: TransactionWithUser,
  taskTitle: string,
  creditLimitUsage?: { used: number; limit: number; remaining: number } | null,
): PayoutTransaction {
  const { user } = tx;
  return {
    id: tx.id,
    userId: user.id,
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    source: tx.source,
    bonusPeriod: tx.bonusPeriod,
    taskTitle,
    developerName: user.legalName || user.linearEmail || "Unknown Developer",
    paymentMethod: user.paymentMethod,
    paypalEmail: user.paypalEmail,
    duitNowId: user.duitNowId,
    bankName: user.bankName,
    bankAccountNumber: user.bankAccountNumber,
    bankAccountName: user.bankAccountName,
    robloxId: user.robloxId,
    robuxUsername: user.robuxUsername,
    linearIssueIdentifier: tx.linearIssueIdentifier,
    linearIssueUrl: tx.linearIssueUrl,
    email: user.linearEmail,
    paidAt: tx.paidAt?.toISOString() ?? null,
    rejectedAt: tx.rejectedAt?.toISOString() ?? null,
    rejectionReason: tx.rejectionReason,
    autoApproved: tx.autoApproved,
    proofStatus: tx.pptPayoutState?.status ?? null,
    proofReason: tx.pptPayoutState?.reason ?? null,
    proofCommentUrl: tx.pptPayoutState?.proofCommentUrl ?? null,
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
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: { in: ["PENDING", "ON_HOLD"] } },
      include: {
        user: true,
        payout: true,
        bonusCandidates: true,
        incentiveAwards: true,
        pptPayoutState: {
          select: {
            status: true,
            reason: true,
            proofCommentUrl: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.transaction.findMany({
      where: { status: "PAID" },
      include: {
        user: true,
        payout: true,
        bonusCandidates: true,
        incentiveAwards: true,
        pptPayoutState: {
          select: {
            status: true,
            reason: true,
            proofCommentUrl: true,
          },
        },
      },
      orderBy: { paidAt: "desc" },
      take: 50,
    }),
    prisma.transaction.findMany({
      where: { status: "REJECTED" },
      include: {
        user: true,
        payout: true,
        bonusCandidates: true,
        incentiveAwards: true,
        pptPayoutState: {
          select: {
            status: true,
            reason: true,
            proofCommentUrl: true,
          },
        },
      },
      orderBy: { rejectedAt: "desc" },
      take: 50,
    }),
    prisma.pptRequest.findMany({
      where: { status: "PENDING" },
      include: {
        requester: {
          include: { user: { select: { name: true, email: true } } },
        },
        attachments: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    getBonusConfig(),
    getIncentiveConfig(),
    prisma.incentiveAward.findMany({
      include: {
        user: { include: { user: { select: { name: true, email: true } } } },
        awardIssues: {
          include: {
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
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.bonusCandidate.findMany({
      where: { status: "READY_FOR_REVIEW" },
      include: {
        user: {
          include: { user: { select: { email: true, name: true } } },
        },
      },
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
      include: {
        user: { include: { user: { select: { name: true, email: true } } } },
        transaction: {
          include: {
            payout: {
              select: {
                status: true,
              },
            },
          },
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
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
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
      return buildPayoutTransaction(tx, taskTitle, creditUsage);
    }),
  );

  // For paid/rejected, use stored titles (no Linear API calls)
  const paid: PayoutTransaction[] = paidTransactions.map(
    (tx: TransactionWithUser) =>
      buildPayoutTransaction(tx, getStoredTaskTitle(tx)),
  );

  const rejected: PayoutTransaction[] = rejectedTransactions.map(
    (tx: TransactionWithUser) =>
      buildPayoutTransaction(tx, getStoredTaskTitle(tx)),
  );

  const bonusCandidates: BonusReviewCandidate[] = readyBonusCandidates
    .filter((candidate) => candidate.user)
    .map((candidate) => ({
      id: candidate.id,
      userId: candidate.userId as string,
      developerName:
        candidate.user?.legalName ||
        candidate.user?.user.name ||
        candidate.assigneeName ||
        "Unknown Developer",
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
      developerName:
        award.user.legalName ||
        award.user.user.name ||
        award.user.user.email ||
        "Unknown Developer",
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
          select: {
            id: true,
            legalName: true,
            user: { select: { name: true, email: true } },
          },
        })
      : [];
  const proofOverrideNameById = new Map(
    proofOverrideProfiles.map((profile) => [
      profile.id,
      profile.legalName || profile.user.name || profile.user.email,
    ]),
  );

  const pptEligibilityStates: AdminPptEligibilityState[] = pptPayoutStates.map(
    (state) => {
      const nextStep = describePptNextStep(state.status, state.reason);

      return {
        id: state.id,
        linearIssueId: state.linearIssueId,
        linearIssueIdentifier: state.linearIssueIdentifier,
        linearIssueTitle: state.linearIssueTitle,
        linearIssueUrl: state.linearIssueUrl,
        developerName:
          state.user?.legalName ||
          state.user?.user.name ||
          state.assigneeName ||
          null,
        assigneeEmail: state.assigneeEmail,
        status: state.status,
        reason: state.reason,
        owner: nextStep.owner,
        nextStep: nextStep.action,
        completionEpisode: state.completionEpisode,
        proofCommentUrl: state.proofCommentUrl,
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
        pptEligibilityStates={pptEligibilityStates}
        pptRequests={pendingPptRequests.map(
          (req): PptRequestData => ({
            id: req.id,
            requesterName:
              req.requester.legalName ||
              req.requester.user.name ||
              "Unknown Developer",
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

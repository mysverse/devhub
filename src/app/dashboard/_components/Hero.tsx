import type { DeveloperRank, UserProfile } from "@prisma/client";
import { countryNameFromCode } from "@/lib/countries";
import { getUserWeeklyUsage, getWeekBounds } from "@/lib/credit-limit";
import type { CurrencyCode } from "@/lib/currency";
import { getCurrencyForPaymentMethod } from "@/lib/currency";
import {
  duitNowIdTypeLabel,
  formatDuitNowIdForDisplay,
} from "@/lib/duitnow-id";
import { getAssignedActiveIssuesForUser } from "@/lib/linear-data";
import { resolveLinearFetchError } from "@/lib/linear-error";
import {
  getBankDisplayName,
  getPaymentMethodLabel,
} from "@/lib/payment-validation";
import {
  type SelectableCampaign,
  selectCampaignBadge,
} from "@/lib/payout-campaign";
import {
  getLiveCampaignRows,
  toSelectableCampaign,
} from "@/lib/payout-campaign-server";
import { getResolvedPayoutPolicy } from "@/lib/payout-policy-server";
import { projectPptPayout } from "@/lib/ppt-payout-presentation";
import prisma from "@/lib/prisma";
import HeroPrimary from "./HeroPrimary";

type Props = {
  userProfile: UserProfile;
  userId: string;
  currency: CurrencyCode;
  user: { name?: string | null; email?: string | null };
};

function getPaymentMethodDetail(userProfile: UserProfile) {
  if (userProfile.paymentMethod === "PAYPAL") {
    return userProfile.paypalEmail || "Not set";
  }

  if (userProfile.paymentMethod === "ROBUX") {
    return userProfile.robuxUsername || "Not set";
  }

  if (userProfile.paymentMethod === "BANK_TRANSFER") {
    return userProfile.bankAccountNumber
      ? `${getBankDisplayName(userProfile.bankName)} - ${
          userProfile.bankAccountNumber
        }`
      : "Not set";
  }

  if (userProfile.paymentMethod === "DUITNOW") {
    // Bank details first, matching classifyPayoutRoute — showing the proxy
    // while the bank account is what actually gets paid is how the admin card
    // came to disagree with the router.
    if (userProfile.bankAccountNumber) {
      return `${getBankDisplayName(userProfile.bankName)} - ${
        userProfile.bankAccountNumber
      }`;
    }
    if (!userProfile.duitNowId) return "Not set";
    if (userProfile.duitNowIdStatus === "UNREACHABLE") {
      return "Not reachable — needs fixing";
    }
    if (!userProfile.duitNowIdType) return `ID: ${userProfile.duitNowId}`;
    const label = `${duitNowIdTypeLabel(userProfile.duitNowIdType)} ${formatDuitNowIdForDisplay(userProfile.duitNowIdType, userProfile.duitNowId)}`;
    if (userProfile.duitNowIdType !== "PASSPORT") return label;
    // The bank cannot pay a passport without its issuing country. Kept short:
    // the tile truncates, and turning yellow is the only other signal it has.
    return userProfile.duitNowIdCountry
      ? `${label} (${countryNameFromCode(userProfile.duitNowIdCountry)})`
      : `${label} — add issuing country`;
  }

  return "Not set";
}

function isPaymentMethodSet(userProfile: UserProfile) {
  if (userProfile.paymentMethod === "PAYPAL") {
    return Boolean(userProfile.paypalEmail);
  }

  if (userProfile.paymentMethod === "ROBUX") {
    return Boolean(userProfile.robuxUsername);
  }

  if (userProfile.paymentMethod === "BANK_TRANSFER") {
    return Boolean(userProfile.bankName && userProfile.bankAccountNumber);
  }

  if (userProfile.paymentMethod === "DUITNOW") {
    if (userProfile.bankAccountNumber) return true;
    // A proxy the bank could not find is not "set" in any sense the developer
    // cares about: this drives the dashboard's own "payment details complete"
    // signal, and saying complete while an admin has recorded that we cannot
    // pay them is the opposite of what that signal is for. Nor is a passport
    // with no issuing country — the bank refuses it. A missing institution
    // does not count: that is the developer's claim, not a payment input.
    if (!userProfile.duitNowId) return false;
    if (userProfile.duitNowIdStatus === "UNREACHABLE") return false;
    return (
      userProfile.duitNowIdType !== "PASSPORT" ||
      Boolean(userProfile.duitNowIdCountry)
    );
  }

  return false;
}

async function getActivePptPending({
  userId,
  linearId,
  currency,
  liveCampaigns,
  developerRank,
}: {
  userId: string;
  linearId: string | null;
  currency: CurrencyCode;
  liveCampaigns: SelectableCampaign[];
  developerRank: DeveloperRank | null;
}) {
  if (!linearId) return { amount: 0, count: 0 };

  try {
    const assignedIssues = await getAssignedActiveIssuesForUser(
      userId,
      linearId,
    );
    const activePptIssues = assignedIssues.filter((issue) =>
      issue.labelNames.some((label) => label.toUpperCase() === "PPT"),
    );

    return {
      // Campaign-aware per issue, so the headline projection agrees with the
      // amounts on the task cards it is summing.
      amount: activePptIssues.reduce((sum, issue) => {
        if (!issue.estimate) return sum;
        const campaign = selectCampaignBadge(liveCampaigns, {
          scope: "PPT",
          userId,
          rank: developerRank,
          labels: issue.labelNames,
        });
        return (
          sum +
          (projectPptPayout(issue.estimate, currency, campaign).finalAmount ??
            0)
        );
      }, 0),
      count: activePptIssues.length,
    };
  } catch (e) {
    resolveLinearFetchError(e, "/dashboard", "hero active tasks");
    return { amount: 0, count: 0 };
  }
}

export default async function Hero({
  userProfile,
  userId,
  currency,
  user,
}: Props) {
  const liveCampaigns = (await getLiveCampaignRows()).map(toSelectableCampaign);

  const [
    { amount: activePptPendingAmount, count },
    transactionTotals,
    creditUsage,
  ] = await Promise.all([
    getActivePptPending({
      userId,
      linearId: userProfile.linearId,
      currency,
      liveCampaigns,
      developerRank: userProfile.developerRank,
    }),
    prisma.transaction.groupBy({
      by: ["status", "source"],
      where: {
        userId,
        currency,
      },
      _sum: { amount: true },
    }),
    getUserWeeklyUsage(userId, currency),
  ]);

  const databasePendingBalance = transactionTotals
    .filter((tx) => tx.status === "PENDING" && tx.source === "PPT")
    .reduce((sum, tx) => sum + (tx._sum.amount ?? 0), 0);
  const totalEarned = transactionTotals
    .filter((tx) => tx.status === "PAID")
    .reduce((sum, tx) => sum + (tx._sum.amount ?? 0), 0);
  const approvedBonusBalance =
    transactionTotals.find(
      (t) => t.status === "PENDING" && t.source === "BONUS",
    )?._sum.amount ?? 0;
  const { weekEnd } = getWeekBounds();
  const firstName = user.name?.split(" ")[0] ?? "there";
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const weeklyResetLabel = `Resets ${weekEnd.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })} 23:59 UTC`;

  // Board-wide PPT campaign for the rate table in the help drawer. Announcement
  // semantics: the drawer answers "what is the promo right now", while the
  // per-task badge answers "does this task qualify".
  const campaign = selectCampaignBadge(liveCampaigns, {
    scope: "PPT",
    userId,
    rank: userProfile.developerRank,
    labelMatch: "ignore",
  });

  return (
    <HeroPrimary
      firstName={firstName}
      currency={currency}
      pendingTransactionsAmount={databasePendingBalance}
      estimatedActiveAmount={activePptPendingAmount}
      activeTaskCount={count}
      totalEarned={totalEarned}
      approvedBonusBalance={approvedBonusBalance}
      weeklyUsed={creditUsage.used}
      weeklyLimit={creditUsage.limit}
      weeklyResetLabel={weeklyResetLabel}
      paymentMethodLabel={getPaymentMethodLabel(userProfile.paymentMethod)}
      paymentMethodDetail={getPaymentMethodDetail(userProfile)}
      paymentMethodCurrency={getCurrencyForPaymentMethod(
        userProfile.paymentMethod,
      )}
      isPaymentMethodSet={isPaymentMethodSet(userProfile)}
      todayLabel={todayLabel}
      policy={getResolvedPayoutPolicy()}
      campaign={campaign}
    />
  );
}

import type { UserProfile } from "@prisma/client";
import { getUserWeeklyUsage, getWeekBounds } from "@/lib/credit-limit";
import type { CurrencyCode } from "@/lib/currency";
import { estimateToAmount, getCurrencyForPaymentMethod } from "@/lib/currency";
import { getAssignedActiveIssuesForUser } from "@/lib/linear-data";
import { resolveLinearFetchError } from "@/lib/linear-error";
import {
  getBankDisplayName,
  getPaymentMethodLabel,
} from "@/lib/payment-validation";
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
    return userProfile.duitNowId
      ? `ID: ${userProfile.duitNowId}`
      : userProfile.bankAccountNumber
        ? `${getBankDisplayName(userProfile.bankName)} - ${
            userProfile.bankAccountNumber
          }`
        : "Not set";
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
    return Boolean(userProfile.duitNowId || userProfile.bankAccountNumber);
  }

  return false;
}

async function getActivePptPending({
  userId,
  linearId,
  currency,
}: {
  userId: string;
  linearId: string | null;
  currency: CurrencyCode;
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
      amount: activePptIssues.reduce((sum, issue) => {
        return (
          sum +
          (issue.estimate ? estimateToAmount(issue.estimate, currency) : 0)
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
  const [
    { amount: activePptPendingAmount, count },
    transactionTotals,
    creditUsage,
  ] = await Promise.all([
    getActivePptPending({
      userId,
      linearId: userProfile.linearId,
      currency,
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
  const pendingAmount = databasePendingBalance + activePptPendingAmount;
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

  return (
    <HeroPrimary
      firstName={firstName}
      currency={currency}
      pendingAmount={pendingAmount}
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
    />
  );
}

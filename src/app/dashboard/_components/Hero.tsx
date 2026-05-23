import type { Transaction, UserProfile } from "@prisma/client";
import { redirect } from "next/navigation";
import { getUserWeeklyUsage, getWeekBounds } from "@/lib/credit-limit";
import type { CurrencyCode } from "@/lib/currency";
import { estimateToAmount, getCurrencyForPaymentMethod } from "@/lib/currency";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import {
  getBankDisplayName,
  getPaymentMethodLabel,
} from "@/lib/payment-validation";
import prisma from "@/lib/prisma";
import HeroPrimary from "./HeroPrimary";

type Props = {
  userProfile: UserProfile & { transactions: Transaction[] };
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
    return await withLinearFallback(userId, async (client) => {
      const response = await client.issues({
        first: 50,
        filter: {
          assignee: { id: { eq: linearId } },
        },
      });

      const issuesWithState = await Promise.all(
        response.nodes.map(async (issue) => {
          const [state, labels] = await Promise.all([
            issue.state,
            issue.labels(),
          ]);
          return {
            issue,
            state,
            hasPptLabel: labels.nodes.some(
              (label) => label.name.toUpperCase() === "PPT",
            ),
          };
        }),
      );

      const activePptIssues = issuesWithState.filter(
        ({ state, hasPptLabel }) =>
          hasPptLabel &&
          state?.type !== "completed" &&
          state?.type !== "canceled",
      );

      return {
        amount: activePptIssues.reduce((sum, { issue }) => {
          return (
            sum +
            (issue.estimate ? estimateToAmount(issue.estimate, currency) : 0)
          );
        }, 0),
        count: activePptIssues.length,
      };
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      redirect("/auth/reauth-linear?returnTo=/dashboard");
    }
    console.error("Failed to fetch active tasks for hero:", e);
    return { amount: 0, count: 0 };
  }
}

export default async function Hero({
  userProfile,
  userId,
  currency,
  user,
}: Props) {
  const [{ amount: activePptPendingAmount, count }, approvedBonusBalance] =
    await Promise.all([
      getActivePptPending({
        userId,
        linearId: userProfile.linearId,
        currency,
      }),
      prisma.transaction.aggregate({
        where: {
          userId,
          currency,
          source: "BONUS",
          status: "PENDING",
        },
        _sum: { amount: true },
      }),
    ]);

  const databasePendingBalance = userProfile.transactions
    .filter(
      (tx) =>
        tx.status === "PENDING" &&
        tx.source === "PPT" &&
        tx.currency === currency,
    )
    .reduce((sum: number, tx) => sum + tx.amount, 0);
  const pendingAmount = databasePendingBalance + activePptPendingAmount;
  const totalEarned = userProfile.transactions
    .filter((tx) => tx.status === "PAID" && tx.currency === currency)
    .reduce((sum: number, tx) => sum + tx.amount, 0);
  const creditUsage = await getUserWeeklyUsage(userId, currency);
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
      approvedBonusBalance={approvedBonusBalance._sum.amount ?? 0}
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

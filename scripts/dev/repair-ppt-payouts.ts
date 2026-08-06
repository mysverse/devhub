import { config } from "dotenv";
import {
  type CurrencyCode,
  estimateToAmount,
  linearEstimateToComplexityLevel,
} from "@/lib/currency";
import { applyMultiplier } from "@/lib/payout-campaign";
import prisma from "@/lib/prisma";

config({ path: ".env.mock", quiet: true });

const apply = process.argv.includes("--apply");

function currencyCode(currency: string): CurrencyCode {
  return currency === "ROBUX" ? "ROBUX" : "MYR";
}

/**
 * What this transaction should be worth: the normalized complexity scale,
 * multiplied by whatever campaign was locked onto it.
 *
 * Campaign-aware on purpose. Comparing against the bare 1x rate would flag
 * every promo payout as wrong and, with --apply, quietly claw back the uplift
 * developers were promised.
 */
function expectedAmount(
  estimate: number | null,
  currency: CurrencyCode,
  campaignMultiplier: number | null,
): { base: number; final: number } | null {
  const complexity = linearEstimateToComplexityLevel(estimate);
  if (complexity == null) return null;
  const base = estimateToAmount(complexity, currency);
  return {
    base,
    final:
      campaignMultiplier && campaignMultiplier > 1
        ? applyMultiplier(base, campaignMultiplier, currency)
        : base,
  };
}

async function main() {
  const transactions = await prisma.transaction.findMany({
    where: {
      source: "PPT",
      linearIssueId: { not: null },
      status: { in: ["PENDING", "ON_HOLD", "PAID"] },
    },
    include: {
      payout: true,
      pptPayoutState: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const unpaidFixes: {
    id: string;
    issue: string | null;
    current: number;
    expected: number;
    expectedBase: number;
    campaign: string | null;
    currency: CurrencyCode;
  }[] = [];
  const paidReview: {
    id: string;
    issue: string | null;
    current: number;
    expected: number | null;
    currency: CurrencyCode;
    reason: string;
  }[] = [];

  for (const tx of transactions) {
    const currency = currencyCode(tx.currency);
    const multiplier =
      tx.campaignMultiplier ?? tx.pptPayoutState?.campaignMultiplier ?? null;
    const expected = expectedAmount(
      tx.pptPayoutState?.estimate ?? null,
      currency,
      multiplier,
    );
    const issue = tx.linearIssueIdentifier ?? tx.linearIssueId;
    const campaign =
      multiplier && multiplier > 1 ? `${multiplier}x campaign` : null;

    if (tx.status === "PAID") {
      if (tx.payout?.status !== "COMPLETED") {
        paidReview.push({
          id: tx.id,
          issue,
          current: tx.amount,
          expected: expected?.final ?? null,
          currency,
          reason: tx.payout
            ? `provider payout is ${tx.payout.status}`
            : "no provider payout record",
        });
      }
      if (expected != null && Math.abs(tx.amount - expected.final) > 0.0001) {
        paidReview.push({
          id: tx.id,
          issue,
          current: tx.amount,
          expected: expected.final,
          currency,
          reason: campaign
            ? `amount does not match the normalized complexity scale under its ${campaign}`
            : "amount does not match normalized complexity scale",
        });
      }
      continue;
    }

    if (expected != null && Math.abs(tx.amount - expected.final) > 0.0001) {
      unpaidFixes.push({
        id: tx.id,
        issue,
        current: tx.amount,
        expected: expected.final,
        expectedBase: expected.base,
        campaign,
        currency,
      });
    }
  }

  console.log(`Scanned ${transactions.length} PPT transactions.`);
  console.log(`Unpaid recalculations: ${unpaidFixes.length}`);
  for (const fix of unpaidFixes) {
    console.log(
      `${fix.issue ?? fix.id}: ${fix.current} ${fix.currency} -> ${fix.expected} ${fix.currency}${
        fix.campaign ? ` (${fix.expectedBase} base x ${fix.campaign})` : ""
      }`,
    );
    if (apply) {
      await prisma.transaction.update({
        where: { id: fix.id },
        data: {
          amount: fix.expected,
          baseAmount: fix.expectedBase,
        },
      });
    }
  }

  console.log(`Paid transactions needing review: ${paidReview.length}`);
  for (const item of paidReview) {
    console.log(
      `${item.issue ?? item.id}: ${item.current} ${item.currency}, expected ${
        item.expected ?? "unknown"
      } ${item.currency} (${item.reason})`,
    );
  }

  if (!apply && unpaidFixes.length > 0) {
    console.log("Run with --apply to update unpaid PENDING/ON_HOLD amounts.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

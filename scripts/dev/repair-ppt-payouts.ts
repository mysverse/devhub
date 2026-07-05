import { config } from "dotenv";
import {
  type CurrencyCode,
  estimateToAmount,
  linearEstimateToComplexityLevel,
} from "@/lib/currency";
import prisma from "@/lib/prisma";

config({ path: ".env.mock", quiet: true });

const apply = process.argv.includes("--apply");

function currencyCode(currency: string): CurrencyCode {
  return currency === "ROBUX" ? "ROBUX" : "MYR";
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
    const complexity = linearEstimateToComplexityLevel(
      tx.pptPayoutState?.estimate ?? null,
    );
    const expected =
      complexity == null ? null : estimateToAmount(complexity, currency);
    const issue = tx.linearIssueIdentifier ?? tx.linearIssueId;

    if (tx.status === "PAID") {
      if (tx.payout?.status !== "COMPLETED") {
        paidReview.push({
          id: tx.id,
          issue,
          current: tx.amount,
          expected,
          currency,
          reason: tx.payout
            ? `provider payout is ${tx.payout.status}`
            : "no provider payout record",
        });
      }
      if (expected != null && Math.abs(tx.amount - expected) > 0.0001) {
        paidReview.push({
          id: tx.id,
          issue,
          current: tx.amount,
          expected,
          currency,
          reason: "amount does not match normalized complexity scale",
        });
      }
      continue;
    }

    if (expected != null && Math.abs(tx.amount - expected) > 0.0001) {
      unpaidFixes.push({
        id: tx.id,
        issue,
        current: tx.amount,
        expected,
        currency,
      });
    }
  }

  console.log(`Scanned ${transactions.length} PPT transactions.`);
  console.log(`Unpaid recalculations: ${unpaidFixes.length}`);
  for (const fix of unpaidFixes) {
    console.log(
      `${fix.issue ?? fix.id}: ${fix.current} ${fix.currency} -> ${fix.expected} ${fix.currency}`,
    );
    if (apply) {
      await prisma.transaction.update({
        where: { id: fix.id },
        data: { amount: fix.expected },
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

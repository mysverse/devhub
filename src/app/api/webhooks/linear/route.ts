import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { siteConfig } from "@/lib/config";
import { isWithinCreditLimit } from "@/lib/credit-limit";
import {
  type CurrencyCode,
  estimateToAmount,
  getCurrencyForPaymentMethod,
} from "@/lib/currency";
import { initiateAutoPayout } from "@/lib/payout";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const signature = req.headers.get("linear-signature");
  const body = await req.text();

  // Verify Webhook Signature (if LINEAR_WEBHOOK_SECRET is set)
  const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;
  if (webhookSecret && signature) {
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");
    if (signature !== expectedSignature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  const payload = JSON.parse(body);

  // We only care about Issue updates
  if (payload.action === "update" && payload.type === "Issue") {
    const issueData = payload.data;

    // Check if it has a PPT label
    const hasPptLabel = Array.isArray(issueData.labels)
      ? issueData.labels.some(
          (label: { name: string }) => label.name.toUpperCase() === "PPT",
        )
      : false;

    // Must be completed, have a PPT label, a complexity estimate, and an assignee
    if (
      issueData.state?.type === "completed" &&
      hasPptLabel &&
      issueData.estimate &&
      issueData.assignee?.email
    ) {
      const assigneeEmail = issueData.assignee.email;

      // Find the user by their Linear Email
      const user = await prisma.userProfile.findFirst({
        where: { linearEmail: assigneeEmail },
      });

      if (user) {
        const currency = getCurrencyForPaymentMethod(user.paymentMethod);
        const pptAmount = estimateToAmount(issueData.estimate, currency);

        // Check credit limit BEFORE creating the transaction to avoid double-counting
        const withinLimit = await isWithinCreditLimit(
          user.id,
          currency as CurrencyCode,
          pptAmount,
        );

        // Check for existing transaction for this issue
        const existing = await prisma.transaction.findUnique({
          where: { linearIssueId: issueData.id },
        });

        // Skip if there's already a non-rejected transaction (PENDING/PAID)
        if (existing && existing.status !== "REJECTED") {
          return NextResponse.json({ success: true });
        }

        // Delete rejected transaction so we can recreate it
        if (existing?.status === "REJECTED") {
          await prisma.payout.deleteMany({
            where: { transactionId: existing.id },
          });
          await prisma.transaction.delete({
            where: { id: existing.id },
          });
        }

        const tx = await prisma.transaction.create({
          data: {
            userId: user.id,
            linearIssueId: issueData.id,
            linearIssueIdentifier: issueData.identifier || null,
            linearIssueTitle: issueData.title || null,
            linearIssueUrl: issueData.url || null,
            amount: pptAmount,
            currency,
            status: "PENDING",
            autoApproved: withinLimit,
          },
        });

        if (withinLimit) {
          // Auto-payout via best available provider — must await to prevent
          // serverless function from terminating before the API call completes
          try {
            await initiateAutoPayout(tx.id);
          } catch (err) {
            console.error(`Auto-payout failed for transaction ${tx.id}:`, err);
          }
        }

        console.log(
          `PPT of ${pptAmount} ${currency} credited to ${assigneeEmail} for issue ${issueData.id}${withinLimit ? " (auto-approved)" : ""}`,
        );
      } else {
        console.warn(
          `Could not find a linked ${siteConfig.appName} user with Linear email: ${assigneeEmail}`,
        );
      }
    }
  }

  return NextResponse.json({ success: true });
}

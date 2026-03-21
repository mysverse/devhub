import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { siteConfig } from "@/lib/config";
import { estimateToAmount, getCurrencyForPaymentMethod } from "@/lib/currency";
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

    // Check if it's marked as done. Let's assume state.type "completed"
    if (
      issueData.state?.type === "completed" &&
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

        // Use upsert to prevent double crediting the same issue if webhook fires twice
        await prisma.transaction.upsert({
          where: { linearIssueId: issueData.id },
          update: {},
          create: {
            userId: user.id,
            linearIssueId: issueData.id,
            linearIssueIdentifier: issueData.identifier || null,
            linearIssueTitle: issueData.title || null,
            linearIssueUrl: issueData.url || null,
            amount: pptAmount,
            currency,
            status: "PENDING",
          },
        });
        console.log(
          `PPT of ${pptAmount} ${currency} credited to ${assigneeEmail} for issue ${issueData.id}`,
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

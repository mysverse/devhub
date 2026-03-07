import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import {
  createTransactionSlipPdf,
  type TransactionSlipData,
} from "@/lib/transaction-slip-pdf";

type Params = Promise<{ id: string }>;

export async function GET(_request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            legalName: true,
            paymentMethod: true,
            paypalEmail: true,
            duitNowId: true,
            bankName: true,
            bankAccountNumber: true,
            bankAccountName: true,
            robuxUsername: true,
          },
        },
      },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 },
      );
    }

    // Allow access if user owns the transaction or is an admin
    const requestingUser = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (transaction.userId !== userId && requestingUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const slipData: TransactionSlipData = {
      transactionId: transaction.id,
      linearIssueIdentifier: transaction.linearIssueIdentifier,
      linearIssueTitle: transaction.linearIssueTitle,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      createdAt: transaction.createdAt,
      paidAt: transaction.paidAt,
      legalName: transaction.user.legalName,
      paymentMethod: transaction.user.paymentMethod,
      paypalEmail: transaction.user.paypalEmail,
      duitNowId: transaction.user.duitNowId,
      bankName: transaction.user.bankName,
      bankAccountNumber: transaction.user.bankAccountNumber,
      bankAccountName: transaction.user.bankAccountName,
      robuxUsername: transaction.user.robuxUsername,
    };

    const pdfDoc = createTransactionSlipPdf(slipData);
    const buffer = await renderToBuffer(pdfDoc);

    const slipId = transaction.id.slice(-8);
    const filename = `payment-slip-${slipId}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error("PDF generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}

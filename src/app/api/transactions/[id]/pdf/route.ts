import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { generateTransactionSlipBuffer } from "@/lib/transaction-slip-pdf";

type Params = Promise<{ id: string }>;

export async function GET(_request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check ownership or admin access before generating
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 },
      );
    }

    const requestingUser = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (transaction.userId !== userId && requestingUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { buffer, filename } = await generateTransactionSlipBuffer(id);

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

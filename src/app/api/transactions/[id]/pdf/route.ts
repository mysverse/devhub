import { getDownloadUrl } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import { hasAdminAccess } from "@/lib/authz";
import { logPiiAccess } from "@/lib/pii-audit";
import prisma from "@/lib/prisma";
import { generateTransactionSlipBuffer } from "@/lib/transaction-slip-pdf";

type Params = Promise<{ id: string }>;

export async function GET(req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check ownership or admin access before generating
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      select: { userId: true, pdfBlobUrl: true },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 },
      );
    }

    const requestingUser = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { role: true, developerRank: true },
    });

    if (transaction.userId !== userId && !hasAdminAccess(requestingUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only when someone ELSE reads the slip: a developer downloading their own
    // payment record is not a PII access event, and logging it would bury the
    // rows that matter. The slip carries legalName and full bank details.
    if (transaction.userId !== userId) {
      await logPiiAccess({
        actorId: userId,
        subjectId: transaction.userId,
        resource: "BANK_DETAILS",
        resourceId: id,
        context: "/api/transactions/[id]/pdf",
        headers: req.headers,
      });
    }

    const slipId = id.slice(-8);

    // Serve stored blob if available (finalized transactions)
    if (transaction.pdfBlobUrl) {
      const downloadUrl = await getDownloadUrl(transaction.pdfBlobUrl);
      const blobResponse = await fetch(downloadUrl);
      if (blobResponse.ok) {
        const arrayBuffer = await blobResponse.arrayBuffer();
        return new NextResponse(new Uint8Array(arrayBuffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="payment-slip-${slipId}.pdf"`,
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
      // If blob fetch fails, fall through to on-the-fly generation
    }

    // Fallback: generate on-the-fly (for PENDING or legacy transactions)
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

import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import { createDocumentPdf } from "@/lib/markdown-to-pdf";
import prisma from "@/lib/prisma";

type Params = Promise<{ id: string }>;

export async function GET(_request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const signedDocument = await prisma.signedDocument.findUnique({
      where: { id },
      include: {
        coiEntries: { orderBy: { createdAt: "asc" } },
        user: { select: { role: true } },
      },
    });

    if (!signedDocument) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    // Allow access if user owns the document or is an admin
    const requestingUser = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (signedDocument.userId !== userId && requestingUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pdfDoc = createDocumentPdf({
      title: `${signedDocument.documentType} Agreement`,
      version: signedDocument.templateVersion,
      content: signedDocument.templateContent,
      legalName: signedDocument.legalName,
      signedAt: signedDocument.signedAt,
      coiEntries:
        signedDocument.documentType === "COI"
          ? signedDocument.coiEntries.map((e) => ({
              organizationName: e.organizationName,
              natureOfInvolvement: e.natureOfInvolvement,
              description: e.description,
            }))
          : undefined,
    });

    const buffer = await renderToBuffer(pdfDoc);

    const filename = `${signedDocument.documentType.toLowerCase()}-${signedDocument.legalName.replace(/\s+/g, "-").toLowerCase()}.pdf`;

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

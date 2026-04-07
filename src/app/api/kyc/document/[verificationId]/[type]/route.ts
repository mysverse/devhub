import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

const VALID_TYPES = new Set(["id-document", "selfie"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ verificationId: string; type: string }> },
) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require admin role
  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!userProfile || userProfile.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { verificationId, type } = await params;

  if (!VALID_TYPES.has(type)) {
    return NextResponse.json(
      { error: "Invalid document type" },
      { status: 400 },
    );
  }

  const verification = await prisma.kycVerification.findUnique({
    where: { id: verificationId },
  });

  if (!verification) {
    return NextResponse.json(
      { error: "Verification not found" },
      { status: 404 },
    );
  }

  if (verification.documentsDeletedAt) {
    return NextResponse.json(
      { error: "Documents have been deleted" },
      { status: 410 },
    );
  }

  const blobUrl =
    type === "id-document"
      ? verification.idDocumentBlobUrl
      : verification.selfieBlobUrl;

  if (!blobUrl) {
    return NextResponse.json(
      { error: "Document not available" },
      { status: 404 },
    );
  }

  // Fetch blob content server-side using the BLOB_READ_WRITE_TOKEN
  const blobResponse = await fetch(blobUrl, {
    headers: {
      Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
    },
  });

  if (!blobResponse.ok) {
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 502 },
    );
  }

  const contentType = blobResponse.headers.get("content-type") || "image/jpeg";

  return new NextResponse(blobResponse.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}

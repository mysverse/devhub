import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSession } from "@/lib/auth-utils";
import { deleteKycDocuments, uploadKycDocument } from "@/lib/blob-storage";
import { runFollowUps } from "@/lib/fault-isolation";
import {
  createKycAuditEntry,
  detectImageMimeType,
  KYC_DOCUMENT_EXPIRY_DAYS,
  KYC_DOCUMENT_TYPES,
  KYC_MAX_FILE_SIZE,
  KYC_RATE_LIMIT,
} from "@/lib/kyc";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const legalName = formData.get("legalName");
  const documentType = formData.get("documentType");
  const idDocument = formData.get("idDocument");
  const selfie = formData.get("selfie");

  // Validate text fields
  if (typeof legalName !== "string" || legalName.trim().length < 2) {
    return NextResponse.json(
      { error: "Legal name must be at least 2 characters" },
      { status: 400 },
    );
  }

  if (
    typeof documentType !== "string" ||
    !KYC_DOCUMENT_TYPES.includes(documentType)
  ) {
    return NextResponse.json(
      { error: "Invalid document type" },
      { status: 400 },
    );
  }

  // Validate files
  if (!(idDocument instanceof File) || !(selfie instanceof File)) {
    return NextResponse.json(
      { error: "Both ID document and selfie photos are required" },
      { status: 400 },
    );
  }

  if (idDocument.size > KYC_MAX_FILE_SIZE || selfie.size > KYC_MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Each file must be under 10 MB" },
      { status: 400 },
    );
  }

  // Read file buffers and validate MIME via magic bytes
  const idBuffer = Buffer.from(await idDocument.arrayBuffer());
  const selfieBuffer = Buffer.from(await selfie.arrayBuffer());

  const idMime = detectImageMimeType(idBuffer);
  const selfieMime = detectImageMimeType(selfieBuffer);

  if (!idMime || !selfieMime) {
    return NextResponse.json(
      { error: "Only JPEG and PNG image files are accepted" },
      { status: 400 },
    );
  }

  // Rate limit: max submissions per 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCount = await prisma.kycVerification.count({
    where: {
      userId,
      submittedAt: { gte: oneDayAgo },
    },
  });

  if (recentCount >= KYC_RATE_LIMIT) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again in 24 hours." },
      { status: 429 },
    );
  }

  // Block if user already has an active verification
  const existing = await prisma.kycVerification.findFirst({
    where: {
      userId,
      status: { in: ["PENDING", "APPROVED"] },
    },
  });

  if (existing?.status === "APPROVED") {
    return NextResponse.json(
      { error: "Your identity is already verified" },
      { status: 409 },
    );
  }

  if (existing?.status === "PENDING") {
    return NextResponse.json(
      {
        error:
          "You already have a pending verification. Please wait for it to be reviewed.",
      },
      { status: 409 },
    );
  }

  // Create verification record
  const expiresAt = new Date(
    Date.now() + KYC_DOCUMENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  const verification = await prisma.kycVerification.create({
    data: {
      userId,
      legalName: legalName.trim(),
      documentType,
      expiresAt,
    },
  });

  // Tracked so the rollback below can destroy anything that did reach blob
  // storage. kyc-cleanup only ever finds blobs through their kycVerification
  // row, and blob-storage.ts has no list()-based sweep, so a row deleted while
  // its uploads survive leaves a government ID and a selfie there permanently.
  const uploaded: string[] = [];

  try {
    // Strip EXIF metadata using sharp
    const [strippedId, strippedSelfie] = await Promise.all([
      sharp(idBuffer).rotate().toBuffer(),
      sharp(selfieBuffer).rotate().toBuffer(),
    ]);

    // Upload to Vercel Blob
    const [idBlobUrl, selfieBlobUrl] = await Promise.all([
      uploadKycDocument(verification.id, "id-document", strippedId, idMime),
      uploadKycDocument(verification.id, "selfie", strippedSelfie, selfieMime),
    ]);
    uploaded.push(idBlobUrl, selfieBlobUrl);

    // Update record with blob URLs
    await prisma.kycVerification.update({
      where: { id: verification.id },
      data: { idDocumentBlobUrl: idBlobUrl, selfieBlobUrl },
    });

    // Audit log
    await createKycAuditEntry(verification.id, userId, "SUBMITTED");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[kyc] Upload failed:", error);

    // Documents first, then the row that points at them — the reverse order
    // orphans them. Each step is isolated so a failure to delete the blobs
    // does not also skip deleting the row, and neither turns a handled 500
    // into an unhandled one: the delete used to be a bare await in a catch.
    await runFollowUps("kyc-submit-rollback", [
      {
        name: "documents",
        run: async () => {
          if (uploaded.length > 0) await deleteKycDocuments(uploaded);
        },
      },
      {
        name: "verification-row",
        run: () =>
          prisma.kycVerification.delete({ where: { id: verification.id } }),
      },
    ]);

    return NextResponse.json(
      { error: "Failed to upload documents. Please try again." },
      { status: 500 },
    );
  }
}

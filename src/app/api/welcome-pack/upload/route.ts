import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSession } from "@/lib/auth-utils";
import {
  deleteWelcomePackBlob,
  uploadWelcomePackIdCardTemplate,
  uploadWelcomePackItemImage,
  uploadWelcomePackSizeChart,
} from "@/lib/blob-storage";
import { detectImageMimeType } from "@/lib/kyc";
import prisma from "@/lib/prisma";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const KINDS = ["item-image", "size-chart", "id-card-template"] as const;
type Kind = (typeof KINDS)[number];

export async function POST(req: Request) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!profile || profile.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const kindRaw = formData.get("kind");
  const idRaw = formData.get("id");
  const file = formData.get("file");

  if (typeof kindRaw !== "string" || !KINDS.includes(kindRaw as Kind)) {
    return NextResponse.json({ error: "Invalid upload kind" }, { status: 400 });
  }
  const kind = kindRaw as Kind;

  if (typeof idRaw !== "string" || idRaw.length === 0) {
    return NextResponse.json({ error: "Missing target id" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File must be under 10 MB" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = detectImageMimeType(buffer);
  if (!mime) {
    return NextResponse.json(
      { error: "Only JPEG and PNG image files are accepted" },
      { status: 400 },
    );
  }

  let processed: Buffer;
  let width: number | null = null;
  let height: number | null = null;
  try {
    const pipeline = sharp(buffer).rotate();
    if (kind === "id-card-template") {
      const meta = await sharp(buffer).rotate().metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    }
    processed = await pipeline.toBuffer();
  } catch (error) {
    console.error("[welcome-pack] Image processing failed:", error);
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 400 },
    );
  }

  // Verify the target row exists, capture old URL so we can delete it after
  // a successful re-upload.
  let previousUrl: string | null | undefined;
  if (kind === "id-card-template") {
    const pack = await prisma.welcomePack.findUnique({
      where: { id: idRaw },
      select: { idCardTemplateBlobUrl: true },
    });
    if (!pack) {
      return NextResponse.json({ error: "Pack not found" }, { status: 404 });
    }
    previousUrl = pack.idCardTemplateBlobUrl;
  } else {
    const item = await prisma.welcomePackItem.findUnique({
      where: { id: idRaw },
      select: { imageBlobUrl: true, sizeChartBlobUrl: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    previousUrl =
      kind === "item-image" ? item.imageBlobUrl : item.sizeChartBlobUrl;
  }

  let url: string;
  try {
    if (kind === "item-image") {
      url = await uploadWelcomePackItemImage(idRaw, processed, mime);
    } else if (kind === "size-chart") {
      url = await uploadWelcomePackSizeChart(idRaw, processed, mime);
    } else {
      url = await uploadWelcomePackIdCardTemplate(idRaw, processed, mime);
    }
  } catch (error) {
    console.error("[welcome-pack] Upload failed:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 },
    );
  }

  // Persist the URL so the admin doesn't need a separate save step for the file.
  // If the DB write fails (target row deleted concurrently, connection drop)
  // we delete the just-uploaded blob to avoid leaking storage.
  try {
    if (kind === "id-card-template") {
      await prisma.welcomePack.update({
        where: { id: idRaw },
        data: {
          idCardTemplateBlobUrl: url,
          idCardWidth: width,
          idCardHeight: height,
        },
      });
    } else if (kind === "item-image") {
      await prisma.welcomePackItem.update({
        where: { id: idRaw },
        data: { imageBlobUrl: url },
      });
    } else {
      await prisma.welcomePackItem.update({
        where: { id: idRaw },
        data: { sizeChartBlobUrl: url },
      });
    }
  } catch (error) {
    console.error("[welcome-pack] DB write after upload failed:", error);
    await deleteWelcomePackBlob(url);
    return NextResponse.json(
      { error: "Upload completed but record update failed" },
      { status: 500 },
    );
  }

  if (previousUrl) {
    await deleteWelcomePackBlob(previousUrl);
  }

  return NextResponse.json({ url, width, height });
}

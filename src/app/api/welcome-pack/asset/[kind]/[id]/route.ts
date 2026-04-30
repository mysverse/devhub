import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import {
  WELCOME_PACK_ASSET_KINDS,
  type WelcomePackAssetKind,
} from "@/lib/welcome-pack-assets";

const KIND_SET = new Set<string>(WELCOME_PACK_ASSET_KINDS);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  // All consumers (admin pages, eligible user pages, eligibility teaser) are
  // behind the dashboard middleware, so a session check is sufficient — none
  // of these assets are personally identifying.
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kind: rawKind, id } = await params;
  if (!KIND_SET.has(rawKind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  const kind = rawKind as WelcomePackAssetKind;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let blobUrl: string | null = null;
  if (kind === "id-card-template") {
    const pack = await prisma.welcomePack.findUnique({
      where: { id },
      select: { idCardTemplateBlobUrl: true },
    });
    blobUrl = pack?.idCardTemplateBlobUrl ?? null;
  } else {
    const item = await prisma.welcomePackItem.findUnique({
      where: { id },
      select: { imageBlobUrl: true, sizeChartBlobUrl: true },
    });
    if (item) {
      blobUrl =
        kind === "item-image" ? item.imageBlobUrl : item.sizeChartBlobUrl;
    }
  }

  if (!blobUrl) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const upstream = await fetch(blobUrl, {
    headers: {
      Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
    },
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Failed to fetch asset" },
      { status: 502 },
    );
  }

  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      // Short cache: proxy URLs are stable, the cache-buster query param
      // forces fresh fetches after re-uploads.
      "Cache-Control": "private, max-age=300",
    },
  });
}

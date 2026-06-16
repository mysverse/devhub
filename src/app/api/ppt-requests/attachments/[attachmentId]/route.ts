import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import { hasAdminAccess } from "@/lib/authz";
import { fetchLinearAsset } from "@/lib/ppt-request-attachments";
import prisma from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attachmentId } = await params;
  const [attachment, profile] = await Promise.all([
    prisma.pptRequestAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        request: { select: { requesterId: true } },
      },
    }),
    prisma.userProfile.findUnique({
      where: { id: userId },
      select: { role: true, developerRank: true },
    }),
  ]);

  if (!attachment) {
    return NextResponse.json(
      { error: "Attachment not found" },
      { status: 404 },
    );
  }

  const allowed =
    attachment.request.requesterId === userId || hasAdminAccess(profile);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const upstream = await fetchLinearAsset(attachment.linearAssetUrl, userId);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Failed to fetch attachment" },
      { status: 502 },
    );
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("content-type") ?? attachment.mimeType,
  );
  headers.set("Cache-Control", "private, max-age=300");
  headers.set(
    "Content-Disposition",
    `inline; filename="${attachment.filename.replaceAll('"', "")}"`,
  );

  return new NextResponse(upstream.body, { headers });
}

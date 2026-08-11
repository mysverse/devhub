/**
 * Serves and discards a single PPT comment attachment.
 *
 * Linear assets need a bearer token, so a `<img src>` or `<video src>` pointed
 * straight at `linearAssetUrl` renders broken — every browser-side reference
 * goes through here instead, and the token never leaves the server.
 */

import { NextResponse } from "next/server";
import { jsonError, reauthResponse } from "@/app/api/ppt-attachments/shared";
import { getSession } from "@/lib/auth-utils";
import { hasAdminAccess } from "@/lib/authz";
import { LinearReauthRequiredError } from "@/lib/linear";
import { fetchLinearAsset } from "@/lib/ppt-request-attachments";
import prisma from "@/lib/prisma";

/** Upstream headers worth passing through verbatim when they are present. */
const FORWARDED_HEADERS = ["content-length", "content-range"] as const;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getSession();
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = await params;
  const [attachment, profile] = await Promise.all([
    prisma.pptCommentAttachment.findUnique({
      where: { id },
      select: {
        uploadedById: true,
        filename: true,
        mimeType: true,
        linearAssetUrl: true,
      },
    }),
    prisma.userProfile.findUnique({
      where: { id: userId },
      select: { role: true, developerRank: true },
    }),
  ]);

  // 404 rather than 403 for a row the viewer may not see. These ids travel in
  // comment markdown and in URLs people paste around; a distinguishable 403
  // would confirm that a given id exists and who it belongs to.
  if (!attachment) return jsonError("Attachment not found", 404);
  if (attachment.uploadedById !== userId && !hasAdminAccess(profile)) {
    return jsonError("Attachment not found", 404);
  }

  // Range is forwarded verbatim and the 206 is passed back untouched, because
  // that is what makes `<video>` seekable: without it the browser must pull
  // the whole file before it will scrub, and a 25 MB proof video becomes
  // unwatchable on anything but a fast connection.
  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetchLinearAsset(attachment.linearAssetUrl, userId, {
      headers: range ? { Range: range } : undefined,
    });
  } catch (error) {
    if (error instanceof LinearReauthRequiredError) return reauthResponse();
    throw error;
  }

  // `ok` covers 206 as well as 200, so a satisfied range request passes here.
  if (!upstream.ok) {
    // A viewer with no Linear account row at all does not reach the catch
    // above: getValidLinearToken returns null rather than throwing, so
    // fetchLinearAsset sends no Authorization header and Linear answers 401.
    // Reporting that as 502 tells an admin who never linked Linear that the
    // asset is broken, when what they need is to connect their account.
    if (upstream.status === 401 || upstream.status === 403) {
      return reauthResponse();
    }
    return jsonError("Failed to fetch attachment", 502);
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("content-type") ?? attachment.mimeType,
  );
  for (const name of FORWARDED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Advertised even when the upstream response omits it, so the browser knows
  // it may ask for a range on the next request.
  headers.set(
    "Accept-Ranges",
    upstream.headers.get("accept-ranges") ?? "bytes",
  );
  headers.set("Cache-Control", "private, max-age=300");
  headers.set(
    "Content-Disposition",
    `inline; filename="${attachment.filename.replaceAll('"', "")}"`,
  );

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getSession();
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = await params;
  // Idempotent by construction: the scope is the caller's own still-unposted
  // rows, so a repeat discard, someone else's id and a nonexistent id all
  // delete nothing and all answer 204. The client fires this with
  // `keepalive` on unmount and never reads the response.
  //
  // Only the DevHub row goes away — Linear has no API to delete an uploaded
  // asset, so the orphaned bytes there are the price of an abandoned upload.
  await prisma.pptCommentAttachment.deleteMany({
    where: { id, uploadedById: userId, status: "UPLOADED" },
  });

  return new NextResponse(null, { status: 204 });
}

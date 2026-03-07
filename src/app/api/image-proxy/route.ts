import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import { getLinearToken } from "@/lib/linear";

const ALLOWED_HOSTS = ["uploads.linear.app", "linear.app"];

export async function GET(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  const token = await getLinearToken(userId);
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (process.env.LINEAR_API_KEY) {
    headers.Authorization = `Bearer ${process.env.LINEAR_API_KEY}`;
  }

  const upstream = await fetch(url, { headers });

  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status });
  }

  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

/**
 * Dev-mode mock for the Vercel Blob API. @vercel/blob bundles its own undici
 * fetch (bypassing the dev fetch interceptor), so .env.mock points it here
 * via VERCEL_BLOB_API_URL instead.
 *
 *   PUT  /api/dev/blob/?pathname=…  store bytes in memory, return local URLs
 *                                   (the SDK passes the blob pathname as a
 *                                   query param, not a path segment)
 *   POST /api/dev/blob/delete       delete by URL list
 *   GET  /api/dev/blob/<pathname>   serve stored bytes (browser + server
 *                                   loopback fetches); unknown image paths
 *                                   get a placeholder so seeded blob URLs
 *                                   render without pre-uploading anything
 */

import { getDevState } from "@/dev/state";
import { isDevMode } from "@/lib/dev-mode";

// 1x1 grey PNG.
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAKAv1oU3gAAAABJRU5ErkJggg==",
  "base64",
);

let randomSuffixCounter = 0;

function blobBaseUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/dev/blob`;
}

function pathnameFrom(params: { path?: string[] }): string {
  return (params.path ?? []).map(decodeURIComponent).join("/");
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  if (!isDevMode()) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  let pathname =
    url.searchParams.get("pathname") ?? pathnameFrom(await ctx.params);
  if (req.headers.get("x-add-random-suffix") === "1") {
    const dot = pathname.lastIndexOf(".");
    const suffix = `-dev${++randomSuffixCounter}`;
    pathname =
      dot === -1
        ? `${pathname}${suffix}`
        : `${pathname.slice(0, dot)}${suffix}${pathname.slice(dot)}`;
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  const contentType =
    req.headers.get("x-content-type") ?? "application/octet-stream";
  getDevState().blobs.set(pathname, { contentType, bytes });

  const publicUrl = `${blobBaseUrl()}/${pathname}`;
  console.log(
    `[dev-mode] blob stored: ${pathname} (${bytes.byteLength} bytes)`,
  );
  return Response.json({
    url: publicUrl,
    downloadUrl: `${publicUrl}?download=1`,
    pathname,
    contentType,
    contentDisposition: "inline",
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  if (!isDevMode()) return new Response("Not found", { status: 404 });

  const pathname = pathnameFrom(await ctx.params);
  if (pathname !== "delete") {
    return new Response(`Unknown blob API call: POST ${pathname}`, {
      status: 400,
    });
  }

  const { urls } = (await req.json()) as { urls?: string[] };
  const { blobs } = getDevState();
  const base = `${blobBaseUrl()}/`;
  for (const url of urls ?? []) {
    blobs.delete(url.startsWith(base) ? url.slice(base.length) : url);
  }
  return Response.json({});
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  if (!isDevMode()) return new Response("Not found", { status: 404 });

  const pathname = pathnameFrom(await ctx.params);
  const blob = getDevState().blobs.get(pathname);
  if (blob) {
    return new Response(Buffer.from(blob.bytes), {
      headers: { "content-type": blob.contentType },
    });
  }

  // Seeded blob URLs reference files that were never uploaded — serve a
  // placeholder for images so admin/KYC pages render.
  if (/\.(png|jpe?g|webp|gif)$/i.test(pathname)) {
    return new Response(PLACEHOLDER_PNG, {
      headers: { "content-type": "image/png" },
    });
  }
  return new Response(`No mock blob stored at "${pathname}"`, { status: 404 });
}

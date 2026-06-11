/**
 * Dev-mode Vercel Blob API server. @vercel/blob's SDK PUTs to
 * `<api>/?pathname=…` — a trailing-slash URL that Next.js 308-redirects,
 * which the SDK's fetch cannot follow with a body. So the write API runs on
 * a plain node:http server (same process as Next → shares src/dev/state.ts
 * via globalThis), while stored bytes are SERVED to browsers and loopback
 * fetches by the Next route at /api/dev/blob/[[...path]].
 *
 * .env.mock points VERCEL_BLOB_API_URL at this server.
 */

import { createServer } from "node:http";
import { getDevState } from "@/dev/state";

const INSTALLED = Symbol.for("devhub.dev-blob-server");

let randomSuffixCounter = 0;

function publicBlobUrl(pathname: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/dev/blob/${pathname}`;
}

/** Accepts both full public URLs and bare pathnames. */
function toPathname(urlOrPathname: string): string {
  const marker = "/api/dev/blob/";
  const index = urlOrPathname.indexOf(marker);
  const raw =
    index >= 0 ? urlOrPathname.slice(index + marker.length) : urlOrPathname;
  return decodeURIComponent(raw.split("?")[0]).replace(/^\/+/, "");
}

export function startDevBlobServer(): void {
  const g = globalThis as Record<PropertyKey, unknown>;
  if (g[INSTALLED]) return;
  g[INSTALLED] = true;

  const apiUrl = process.env.VERCEL_BLOB_API_URL;
  if (!apiUrl) {
    console.warn("[dev-mode] VERCEL_BLOB_API_URL unset — blob mock disabled");
    return;
  }
  const port = Number(new URL(apiUrl).port || "4983");

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (req.method === "PUT") {
        let pathname = toPathname(
          url.searchParams.get("pathname") ?? url.pathname,
        );
        if (req.headers["x-add-random-suffix"] === "1") {
          const dot = pathname.lastIndexOf(".");
          const suffix = `-dev${++randomSuffixCounter}`;
          pathname =
            dot === -1
              ? `${pathname}${suffix}`
              : `${pathname.slice(0, dot)}${suffix}${pathname.slice(dot)}`;
        }
        const contentType =
          (req.headers["x-content-type"] as string | undefined) ??
          "application/octet-stream";
        getDevState().blobs.set(pathname, {
          contentType,
          bytes: new Uint8Array(body),
        });
        console.log(
          `[dev-mode] blob stored: ${pathname} (${body.byteLength} bytes)`,
        );
        const publicUrl = publicBlobUrl(pathname);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            url: publicUrl,
            downloadUrl: `${publicUrl}?download=1`,
            pathname,
            contentType,
            contentDisposition: "inline",
          }),
        );
        return;
      }

      if (req.method === "POST" && url.pathname === "/delete") {
        const { urls } = JSON.parse(body.toString() || "{}") as {
          urls?: string[];
        };
        const { blobs } = getDevState();
        for (const target of urls ?? []) {
          blobs.delete(toPathname(target));
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
        return;
      }

      if (req.method === "GET") {
        const blob = getDevState().blobs.get(toPathname(url.pathname));
        if (blob) {
          res.writeHead(200, { "content-type": blob.contentType });
          res.end(Buffer.from(blob.bytes));
          return;
        }
      }

      res.writeHead(404, { "content-type": "text/plain" });
      res.end(
        `[dev-mode] blob mock: unhandled ${req.method} ${req.url} — see src/dev/blob-server.ts`,
      );
    });
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.warn(
        `[dev-mode] blob mock port ${port} already in use — assuming another dev server owns it`,
      );
      return;
    }
    console.error("[dev-mode] blob mock server error:", error);
  });
  server.unref();
  server.listen(port, "127.0.0.1", () => {
    console.log(`[dev-mode] Blob mock API listening on 127.0.0.1:${port}`);
  });
}

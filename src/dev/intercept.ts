/**
 * Dev-mode outbound HTTP interception.
 *
 * Installed once per server process by src/instrumentation.ts when
 * DEV_MODE=true. Patches globalThis.fetch so that:
 *   - localhost/loopback requests pass through untouched (Next internals,
 *     the local prisma-dev DB is raw TCP and never hits fetch anyway, and
 *     the mock blob route on localhost:3000),
 *   - known external services are answered by typed handlers under
 *     src/dev/handlers/*, backed by fixtures in src/dev/fixtures/*,
 *   - anything else throws loudly, naming the file to edit.
 *
 * Exception: @vercel/blob bundles its own undici fetch and bypasses this
 * patch entirely — it is redirected via VERCEL_BLOB_API_URL in .env.mock to
 * the dev-only route at /api/dev/blob instead.
 */

const INSTALLED = Symbol.for("devhub.dev-fetch-interceptor");

const PASSTHROUGH_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
  // Next.js infrastructure, not app dependencies: next/font downloads on a
  // cold .next cache, and anonymous telemetry. Harmless offline (next/font
  // falls back), pointless to mock.
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "telemetry.nextjs.org",
]);

export type DevHandler = (req: Request, url: URL) => Promise<Response>;

type DevRoute = {
  name: string;
  match: (url: URL) => boolean;
  load: () => Promise<DevHandler>;
};

const ROUTES: DevRoute[] = [
  {
    name: "linear",
    match: (u) => u.hostname === "api.linear.app",
    load: () => import("@/dev/handlers/linear").then((m) => m.handleLinear),
  },
  {
    name: "upstash",
    match: (u) => u.hostname === "upstash.devhub-mock.local",
    load: () => import("@/dev/handlers/upstash").then((m) => m.handleUpstash),
  },
  {
    name: "resend",
    match: (u) => u.hostname === "api.resend.com",
    load: () => import("@/dev/handlers/resend").then((m) => m.handleResend),
  },
  {
    name: "discord",
    match: (u) => u.hostname === "discord.com",
    load: () => import("@/dev/handlers/discord").then((m) => m.handleDiscord),
  },
  {
    name: "roblox",
    match: (u) =>
      u.hostname === "apis.roblox.com" ||
      u.hostname === "groups.roblox.com" ||
      u.hostname === "users.roblox.com" ||
      u.hostname === "thumbnails.roblox.com",
    load: () => import("@/dev/handlers/roblox").then((m) => m.handleRoblox),
  },
  {
    name: "finsys",
    match: (u) => u.hostname === "finsys.devhub-mock.local",
    load: () => import("@/dev/handlers/finsys").then((m) => m.handleFinsys),
  },
  {
    name: "billplz",
    match: (u) =>
      u.hostname === "www.billplz.com" ||
      u.hostname === "www.billplz-sandbox.com" ||
      u.hostname === "billplz.com" ||
      u.hostname === "billplz-sandbox.com",
    load: () => import("@/dev/handlers/billplz").then((m) => m.handleBillplz),
  },
  {
    name: "xendit",
    match: (u) => u.hostname === "api.xendit.co",
    load: () => import("@/dev/handlers/xendit").then((m) => m.handleXendit),
  },
];

export class DevModeUnhandledExternalRequestError extends Error {
  constructor(req: Request, url: URL) {
    const suggested =
      url.hostname.replace(/^(www|api|apis)\./, "").split(".")[0] || "service";
    super(
      `[dev-mode] Unhandled external request: ${req.method} ${url.origin}${url.pathname}\n` +
        `DEV_MODE=true intercepts all outbound HTTP and no mock handler matched host "${url.hostname}".\n` +
        `Fix: add a handler in src/dev/handlers/${suggested}.ts and register it in the ROUTES table in src/dev/intercept.ts.\n` +
        `If this host genuinely must reach the real network in dev mode, add it to PASSTHROUGH_HOSTS in src/dev/intercept.ts.`,
    );
    this.name = "DevModeUnhandledExternalRequestError";
  }
}

export function installDevFetchInterceptor(): void {
  const g = globalThis as Record<PropertyKey, unknown>;
  if (g[INSTALLED]) return;
  g[INSTALLED] = true;

  const realFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const req = new Request(input, init);
    const url = new URL(req.url);

    if (
      url.protocol === "data:" ||
      url.protocol === "blob:" ||
      PASSTHROUGH_HOSTS.has(url.hostname)
    ) {
      return realFetch(input, init);
    }

    const route = ROUTES.find((r) => r.match(url));
    if (!route) {
      throw new DevModeUnhandledExternalRequestError(req, url);
    }

    const handler = await route.load();
    const res = await handler(req, url);
    console.log(
      `[dev-mode] ${route.name}: ${req.method} ${url.pathname} -> ${res.status}`,
    );
    return res;
  };

  console.log(
    "[dev-mode] Outbound fetch interceptor installed — external HTTP is mocked",
  );
}

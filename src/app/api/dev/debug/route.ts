import { isDevMode } from "@/lib/dev-mode";

export async function GET() {
  if (!isDevMode()) return new Response("Not found", { status: 404 });
  const f = globalThis.fetch as typeof fetch & {
    __nextPatched?: boolean;
    _nextOriginalFetch?: unknown;
  };
  const installed = Boolean(
    (globalThis as Record<PropertyKey, unknown>)[
      Symbol.for("devhub.dev-fetch-interceptor")
    ],
  );
  let probe = "not-attempted";
  try {
    const res = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=refresh_token&refresh_token=mock-linear-refresh-token-developer",
    });
    probe = `status ${res.status}: ${(await res.text()).slice(0, 120)}`;
  } catch (error) {
    probe = `threw: ${(error as Error).message.slice(0, 200)}`;
  }
  return Response.json({
    interceptorInstalledFlag: installed,
    fetchName: f.name,
    nextPatched: f.__nextPatched ?? false,
    hasNextOriginal: Boolean(f._nextOriginalFetch),
    probe,
  });
}

import { NextResponse } from "next/server";
import { isPersonaKey, PERSONAS } from "@/dev/fixtures/personas";
import { auth } from "@/lib/auth";
import { DEV_PASSWORD, isDevMode } from "@/lib/dev-mode";

/**
 * Dev-mode persona login: GET /api/dev/login?as=admin|developer|fresh
 * Establishes a real better-auth session and redirects (admin/developer →
 * /dashboard, fresh → /onboarding, or ?redirect=...). 404s outside dev mode.
 */
export async function GET(req: Request) {
  if (!isDevMode()) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(req.url);
  const personaKey = url.searchParams.get("as") ?? "developer";
  if (!isPersonaKey(personaKey)) {
    return new Response(
      `Unknown persona "${personaKey}" — use one of: ${Object.keys(PERSONAS).join(", ")}`,
      { status: 400 },
    );
  }
  const persona = PERSONAS[personaKey];

  const { headers } = await auth.api.signInEmail({
    body: { email: persona.email, password: DEV_PASSWORD },
    returnHeaders: true,
  });

  const fallback = personaKey === "fresh" ? "/onboarding" : "/dashboard";
  const redirectTo = url.searchParams.get("redirect") ?? fallback;
  const res = NextResponse.redirect(new URL(redirectTo, url.origin), 303);
  for (const cookie of headers.getSetCookie()) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { normalizeSocialPath } from "@/lib/social-previews";

const protectedPaths = ["/dashboard", "/settings", "/onboarding"];
const socialCrawlerUserAgentPattern =
  /Discordbot|Slackbot|Twitterbot|facebookexternalhit|LinkedInBot|TelegramBot|WhatsApp/i;

function isProtected(pathname: string) {
  return protectedPaths.some((p) => pathname.startsWith(p));
}

function isSocialCrawler(req: NextRequest) {
  return socialCrawlerUserAgentPattern.test(
    req.headers.get("user-agent") ?? "",
  );
}

function acceptsHtml(req: NextRequest) {
  const accept = req.headers.get("accept");
  return !accept || accept.includes("text/html") || accept.includes("*/*");
}

function shouldShowPublicSocialPreview(req: NextRequest) {
  return (
    req.method === "GET" &&
    isProtected(req.nextUrl.pathname) &&
    isSocialCrawler(req) &&
    acceptsHtml(req)
  );
}

export default async function middleware(req: NextRequest) {
  if (shouldShowPublicSocialPreview(req)) {
    const previewUrl = new URL("/social-preview", req.url);
    previewUrl.searchParams.set(
      "target",
      normalizeSocialPath(req.nextUrl.pathname),
    );
    return NextResponse.rewrite(previewUrl);
  }

  if (!isProtected(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};

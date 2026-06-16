import type { Metadata } from "next";
import { siteConfig } from "@/lib/config";

export type SocialPreview = {
  path: string;
  title: string;
  description: string;
  label: string;
  matchSubpaths?: boolean;
};

const defaultDescription =
  "Track PPT work, bonuses, payouts, onboarding, and developer operations for the MYSverse team.";

export const socialPreviews: readonly SocialPreview[] = [
  {
    path: "/",
    title: "MYSverse DevHub",
    description: defaultDescription,
    label: "Developer Operations",
  },
  {
    path: "/sign-in",
    title: "Sign in to DevHub",
    description:
      "Access the MYSverse developer operations dashboard with your Linear account.",
    label: "Secure Access",
    matchSubpaths: true,
  },
  {
    path: "/auth/reauth-linear",
    title: "Reconnect Linear",
    description:
      "Refresh Linear access for DevHub task tracking and developer operations.",
    label: "Account Connection",
  },
  {
    path: "/onboarding",
    title: "Developer Onboarding",
    description:
      "Complete profile, account linking, document, and payout setup for MYSverse DevHub.",
    label: "Getting Started",
    matchSubpaths: true,
  },
  {
    path: "/policy/aml-kyc",
    title: "AML/KYC Policy",
    description:
      "Anti-Money Laundering and Know Your Customer policy for MYSverse DevHub payouts.",
    label: "Policy",
  },
  {
    path: "/policy/payment-flow",
    title: "Payment Flow",
    description:
      "How payments work on MYSverse DevHub from task completion to payout.",
    label: "Policy",
  },
  {
    path: "/policy/asset-rights",
    title: "Asset Rights & Ownership Policy",
    description:
      "Asset ownership, licensing, and donation policy regulations for MYSverse.",
    label: "Policy",
  },
  {
    path: "/dashboard",
    title: "Developer Dashboard",
    description:
      "Track PPT work, incentives, leaderboard progress, and payout history in MYSverse DevHub.",
    label: "Dashboard",
    matchSubpaths: true,
  },
  {
    path: "/dashboard/ppts",
    title: "PPT Board",
    description:
      "Browse Pay-Per-Task work and manage PPT requests for the MYSverse developer team.",
    label: "PPT",
    matchSubpaths: true,
  },
  {
    path: "/dashboard/bonuses",
    title: "Bonuses",
    description: "Track eligible bonus work and monthly bonus review status.",
    label: "Bonuses",
    matchSubpaths: true,
  },
  {
    path: "/dashboard/settings",
    title: "HR Settings",
    description:
      "Manage profile details, linked accounts, payout setup, and compliance status.",
    label: "Settings",
    matchSubpaths: true,
  },
  {
    path: "/dashboard/documents",
    title: "Documents",
    description:
      "Review developer agreements and conflict-of-interest records.",
    label: "Documents",
    matchSubpaths: true,
  },
  {
    path: "/dashboard/welcome-pack",
    title: "Welcome Pack",
    description: "Configure and track MYSverse developer welcome pack orders.",
    label: "Welcome Pack",
    matchSubpaths: true,
  },
  {
    path: "/dashboard/notifications",
    title: "Notifications",
    description: "Your DevHub in-app notification history.",
    label: "Notifications",
    matchSubpaths: true,
  },
  {
    path: "/dashboard/admin",
    title: "Admin Payouts",
    description:
      "Review payout operations and developer payment workflows in DevHub.",
    label: "Admin",
    matchSubpaths: true,
  },
  {
    path: "/dashboard/admin/access",
    title: "Access Management",
    description:
      "Manage platform access mappings and sync operations for the MYSverse developer team.",
    label: "Admin",
    matchSubpaths: true,
  },
  {
    path: "/dashboard/admin/documents",
    title: "Document Compliance",
    description:
      "Review developer document compliance and conflict disclosure workflows.",
    label: "Admin",
    matchSubpaths: true,
  },
  {
    path: "/dashboard/admin/kyc",
    title: "KYC Review",
    description:
      "Review payout compliance submissions through MYSverse DevHub.",
    label: "Admin",
    matchSubpaths: true,
  },
  {
    path: "/dashboard/admin/users",
    title: "Team Members",
    description:
      "Manage developer profiles, roles, and operational access in DevHub.",
    label: "Admin",
    matchSubpaths: true,
  },
  {
    path: "/dashboard/admin/welcome-pack",
    title: "Welcome Pack Admin",
    description:
      "Manage welcome pack configuration, orders, and fulfillment workflows.",
    label: "Admin",
    matchSubpaths: true,
  },
] as const;

const previewsByPath = new Map<string, SocialPreview>(
  socialPreviews.map((preview) => [preview.path, preview]),
);

const subpathPreviews = [...socialPreviews]
  .filter((preview) => preview.matchSubpaths)
  .sort((a, b) => b.path.length - a.path.length);

export function normalizeSocialPath(path: string | null | undefined) {
  if (!path) return "/";

  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return "/";

  const withoutQuery = trimmed.split(/[?#]/, 1)[0] || "/";
  const normalized = withoutQuery.replace(/\/{2,}/g, "/");

  if (normalized === "/") return "/";
  return normalized.replace(/\/+$/, "");
}

export function getSocialBaseUrl() {
  const rawUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");

  try {
    return new URL(rawUrl).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export function getAbsoluteSocialUrl(path: string) {
  return new URL(
    normalizeSocialPath(path),
    `${getSocialBaseUrl()}/`,
  ).toString();
}

export function getSocialImageUrl(path: string) {
  const url = new URL("/api/social-image", `${getSocialBaseUrl()}/`);
  url.searchParams.set("path", normalizeSocialPath(path));
  return url.toString();
}

function getRelativeSocialImageUrl(path: string) {
  const params = new URLSearchParams({ path: normalizeSocialPath(path) });
  return `/api/social-image?${params.toString()}`;
}

export function getSocialPreview(path: string | null | undefined) {
  const normalizedPath = normalizeSocialPath(path);
  const exactPreview = previewsByPath.get(normalizedPath);
  if (exactPreview) return exactPreview;

  const subpathPreview = subpathPreviews.find(
    (preview) =>
      normalizedPath !== preview.path &&
      normalizedPath.startsWith(`${preview.path}/`),
  );

  return subpathPreview ?? socialPreviews[0];
}

export function buildSocialMetadata(
  path: string,
  options: {
    noIndex?: boolean;
    title?: string;
    description?: string;
  } = {},
): Metadata {
  const normalizedPath = normalizeSocialPath(path);
  const preview = getSocialPreview(normalizedPath);
  const title = options.title ?? preview.title;
  const description = options.description ?? preview.description;
  const canonicalUrl = normalizedPath;
  const imageUrl = getRelativeSocialImageUrl(normalizedPath);
  const imageAlt = `${title} - ${siteConfig.appName}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: `${siteConfig.name} ${siteConfig.appName}`,
      type: "website",
      locale: "en_MY",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: imageUrl,
          alt: imageAlt,
        },
      ],
    },
    robots: options.noIndex
      ? {
          index: false,
          follow: false,
          nocache: true,
        }
      : undefined,
  };
}

import { redirect } from "next/navigation";
import type { CampaignBannerData } from "@/components/CampaignBanner";
import { getSession } from "@/lib/auth-utils";
import { hasAdminAccess } from "@/lib/authz";
import { isAssistantConfigured, isLlmConfigured } from "@/lib/llm";
import {
  describeCampaignLabelScope,
  describeCampaignScopes,
  getCampaignWindowState,
  selectCampaign,
} from "@/lib/payout-campaign";
import { getCampaignRows } from "@/lib/payout-campaign-server";
import { loadOptionalSection } from "@/lib/section-result";
import { getUserProfile } from "@/lib/user-profile";
import DashboardLayoutClient from "./DashboardLayoutClient";

async function getDashboardAdminStatus() {
  const { userId } = await getSession();
  if (!userId) return false;

  const userProfile = await getUserProfile(userId);
  if (!userProfile) redirect("/onboarding");
  return hasAdminAccess(userProfile);
}

/**
 * The campaign to announce dashboard-wide.
 *
 * Targeting is per developer (rank and participant list), so this is resolved
 * per request rather than cached globally. Label filters are skipped
 * (`labelMatch: "ignore"`) because this is an announcement, not a price quote:
 * a "2x on Docs" campaign would otherwise never announce itself to anyone,
 * since the banner has no single issue to test. The badge on each task card is
 * what says whether that particular task qualifies, and the banner names the
 * label restriction so it cannot read as a blanket multiplier.
 *
 * The window is evaluated here, outside the cached row fetch — reading the
 * clock inside "use cache" would make a campaign go live late.
 */
async function getDashboardCampaign(): Promise<CampaignBannerData | null> {
  const { userId } = await getSession();
  if (!userId) return null;

  const userProfile = await getUserProfile(userId);
  if (!userProfile) return null;

  const rows = await getCampaignRows();
  const live = rows.filter((row) => getCampaignWindowState(row).active);
  if (live.length === 0) return null;

  // Announce the strongest campaign that touches any of this developer's
  // earning paths.
  const announce = {
    userId,
    rank: userProfile.developerRank,
    labelMatch: "ignore" as const,
  };
  const selected =
    selectCampaign(live, { scope: "PPT", ...announce }) ??
    selectCampaign(live, { scope: "BONUS", ...announce }) ??
    selectCampaign(live, { scope: "INCENTIVE", ...announce });
  if (!selected) return null;

  const row = rows.find((candidate) => candidate.id === selected.id);
  if (!row) return null;

  return {
    slug: row.slug,
    name: row.name,
    headline: row.headline,
    body: row.body,
    multiplier: row.multiplier,
    accentColor: row.accentColor,
    endsAt: row.endsAt.toISOString(),
    scopeLabel: describeCampaignScopes(row.scopes),
    labelScope: describeCampaignLabelScope(row),
  };
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayoutClient
      // Both promises are created by the LAYOUT, so a rejection escapes
      // dashboard/error.tsx — that boundary only covers the layout's children —
      // and lands on global-error.tsx, an unstyled box with no nav, replacing
      // every dashboard route. One of the two feeds a decorative promo banner.
      //
      // loadOptionalSection degrades each to its fallback instead: no admin
      // links, no banner. It rethrows Next's control-flow errors, which is
      // load-bearing here because getDashboardAdminStatus() calls
      // redirect("/onboarding") for a user with no profile.
      adminPromise={loadOptionalSection(
        "dashboard admin status",
        getDashboardAdminStatus,
        false,
      )}
      campaignPromise={loadOptionalSection(
        "dashboard campaign banner",
        getDashboardCampaign,
        null,
      )}
      assistantAvailable={isAssistantConfigured()}
      writingAssistAvailable={isLlmConfigured()}
    >
      {children}
    </DashboardLayoutClient>
  );
}

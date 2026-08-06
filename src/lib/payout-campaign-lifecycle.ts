import type { PayoutCampaign, UserProfile } from "@prisma/client";
import { createElement } from "react";
import CampaignStarted from "@/emails/CampaignStarted";
import {
  type CurrencyCode,
  estimateToAmount,
  formatAmount,
  getCurrencyForPaymentMethod,
} from "@/lib/currency";
import { resolveDisplayName } from "@/lib/display-name";
import { EMAIL_CHANNEL, IN_APP_CHANNEL, notify } from "@/lib/notifications";
import {
  applyMultiplier,
  campaignMatches,
  describeCampaignScopes,
  formatMultiplier,
  getCampaignWindowState,
  type SelectableCampaign,
} from "@/lib/payout-campaign";
import prisma from "@/lib/prisma";
import { USER_IDENTITY_SELECT } from "@/lib/prisma-select";

// Campaign announcements: a promo nobody hears about is just an unplanned
// increase in payroll. Three moments matter — it starts, it is about to end,
// and it ended (with what the developer actually earned from it).
//
// Every send is deduped on a key that includes the campaign slug and the
// event, so the daily cron is safe to run repeatedly and a campaign edited
// mid-flight does not re-announce itself.

/** How far ahead of the deadline the "ending soon" nudge goes out. */
const ENDING_SOON_MS = 48 * 60 * 60 * 1000;

function toSelectable(campaign: PayoutCampaign): SelectableCampaign {
  return {
    id: campaign.id,
    slug: campaign.slug,
    name: campaign.name,
    multiplier: campaign.multiplier,
    accentColor: campaign.accentColor,
    scopes: campaign.scopes,
    enabled: campaign.enabled,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    includedLabels: campaign.includedLabels,
    excludedLabels: campaign.excludedLabels,
    ranks: campaign.ranks,
    participantUserIds: campaign.participantUserIds,
    createdAt: campaign.createdAt,
  };
}

/**
 * Everyone this campaign can actually pay. Label filters are skipped — they
 * gate individual tasks, not eligibility, and a developer whose next task
 * happens to carry the right label still needs to know the campaign exists.
 */
async function audienceFor(campaign: PayoutCampaign) {
  const selectable = toSelectable(campaign);
  const profiles = await prisma.userProfile.findMany({
    where: {
      ...(campaign.participantUserIds.length > 0
        ? { id: { in: campaign.participantUserIds } }
        : {}),
      ...(campaign.ranks.length > 0
        ? { developerRank: { in: campaign.ranks } }
        : {}),
      // Someone who has never linked Linear cannot earn from a campaign.
      linearId: { not: null },
    },
    include: { user: { select: USER_IDENTITY_SELECT } },
  });

  return profiles.filter((profile) =>
    campaignMatches(selectable, {
      scope: campaign.scopes[0],
      userId: profile.id,
      rank: profile.developerRank,
      // Ignore the window here: "ended" announcements go out after it closes.
      now: campaign.startsAt,
    }),
  );
}

/** "A 5-point task pays RM300 instead of RM100." */
function rateLineFor(
  campaign: PayoutCampaign,
  currency: CurrencyCode,
): string | null {
  if (!campaign.scopes.includes("PPT")) return null;
  const base = estimateToAmount(5, currency);
  return `A 5-point task pays ${formatAmount(
    applyMultiplier(base, campaign.multiplier, currency),
    currency,
  )} instead of ${formatAmount(base, currency)}.`;
}

async function announceStart(campaign: PayoutCampaign) {
  const audience = await audienceFor(campaign);
  let sent = 0;

  for (const profile of audience) {
    const currency = getCurrencyForPaymentMethod(profile.paymentMethod);
    const scopeLabel = describeCampaignScopes(campaign.scopes);
    const multiplierLabel = formatMultiplier(campaign.multiplier);

    await notify({
      userId: profile.id,
      domain: "campaign",
      type: "STARTED",
      title: `${multiplierLabel} — ${campaign.headline}`,
      message:
        campaign.body ??
        `${scopeLabel} are multiplied until ${campaign.endsAt.toLocaleString()}.`,
      href: "/dashboard/ppts",
      entityType: "payout_campaign",
      entityId: campaign.id,
      payload: {
        campaignId: campaign.id,
        slug: campaign.slug,
        multiplier: campaign.multiplier,
        endsAt: campaign.endsAt.toISOString(),
      },
      dedupeKey: `campaign:STARTED:${profile.id}:${campaign.slug}`,
      channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
      email: profile.user.email
        ? {
            to: profile.user.email,
            subject: `${multiplierLabel} payouts on DevHub — ${campaign.headline}`,
            category: "campaign_started",
            idempotencyKey: `campaign:started:${campaign.slug}:${profile.id}`,
            react: createElement(CampaignStarted, {
              userName: resolveDisplayName({
                profile,
                fallback: "developer",
              }),
              headline: campaign.headline,
              body: campaign.body,
              multiplierLabel,
              scopeLabel,
              endsAt: campaign.endsAt.toISOString(),
              rateLine: rateLineFor(campaign, currency),
            }),
          }
        : undefined,
    });
    sent++;
  }

  return sent;
}

async function announceEndingSoon(campaign: PayoutCampaign) {
  const audience = await audienceFor(campaign);
  const multiplierLabel = formatMultiplier(campaign.multiplier);
  let sent = 0;

  for (const profile of audience) {
    await notify({
      userId: profile.id,
      domain: "campaign",
      type: "ENDING_SOON",
      title: `${multiplierLabel} ends ${campaign.endsAt.toLocaleString()}`,
      message: `${campaign.name} is nearly over. Anything that becomes payable after it ends pays the normal rate.`,
      href: "/dashboard/ppts",
      entityType: "payout_campaign",
      entityId: campaign.id,
      payload: {
        campaignId: campaign.id,
        slug: campaign.slug,
        endsAt: campaign.endsAt.toISOString(),
      },
      dedupeKey: `campaign:ENDING_SOON:${profile.id}:${campaign.slug}`,
      channels: [IN_APP_CHANNEL],
    });
    sent++;
  }

  return sent;
}

/**
 * The wrap-up. Only goes to developers who actually earned uplift — telling
 * somebody a campaign they got nothing from has ended is noise.
 */
async function announceEnded(campaign: PayoutCampaign) {
  const applications = await prisma.payoutCampaignApplication.groupBy({
    by: ["userId", "currency"],
    where: { campaignId: campaign.id, reverted: false },
    _sum: { upliftAmount: true },
  });

  let sent = 0;
  for (const row of applications) {
    const uplift = row._sum.upliftAmount ?? 0;
    if (uplift <= 0) continue;
    const currency: CurrencyCode = row.currency === "ROBUX" ? "ROBUX" : "MYR";

    await notify({
      userId: row.userId,
      domain: "campaign",
      type: "ENDED",
      title: `${campaign.name} has ended`,
      message: `It paid you ${formatAmount(uplift, currency)} on top of the normal rate.`,
      href: "/dashboard/transactions",
      entityType: "payout_campaign",
      entityId: campaign.id,
      payload: {
        campaignId: campaign.id,
        slug: campaign.slug,
        upliftAmount: uplift,
        currency: row.currency,
      },
      dedupeKey: `campaign:ENDED:${row.userId}:${campaign.slug}:${row.currency}`,
      channels: [IN_APP_CHANNEL],
    });
    sent++;
  }

  return sent;
}

export type CampaignLifecycleResult = {
  started: number;
  endingSoon: number;
  ended: number;
};

/**
 * Daily sweep. Idempotent through notify()'s dedupeKey, so re-running it (or
 * running it more often) sends nothing twice.
 */
export async function runCampaignLifecycle(
  now = new Date(),
): Promise<CampaignLifecycleResult> {
  const campaigns = await prisma.payoutCampaign.findMany({
    where: { enabled: true },
  });

  let started = 0;
  let endingSoon = 0;
  let ended = 0;

  for (const campaign of campaigns) {
    const state = getCampaignWindowState(campaign, now);

    if (state.active) {
      started += await announceStart(campaign);
      if (campaign.endsAt.getTime() - now.getTime() <= ENDING_SOON_MS) {
        endingSoon += await announceEndingSoon(campaign);
      }
      continue;
    }

    // Wrap up only recently-finished campaigns; a campaign that closed months
    // ago has nothing new to say.
    if (
      state.reason === "ended" &&
      now.getTime() - campaign.endsAt.getTime() <= 7 * 24 * 60 * 60 * 1000
    ) {
      ended += await announceEnded(campaign);
    }
  }

  return { started, endingSoon, ended };
}

export type { UserProfile };

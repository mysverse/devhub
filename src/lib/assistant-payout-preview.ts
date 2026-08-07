import type { AssistantPptPayoutPreview } from "@/lib/assistant-types";
import type { CurrencyCode } from "@/lib/currency";
import type { CampaignBadgeInfo } from "@/lib/payout-campaign";
import { projectPptPayout } from "@/lib/ppt-payout-presentation";

function finiteAmount(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

export function buildAssistantPptPayoutPreview(
  estimate: number | null | undefined,
  currency: CurrencyCode,
  campaign?: CampaignBadgeInfo | null,
): AssistantPptPayoutPreview {
  const projection = projectPptPayout(estimate, currency, campaign);
  return {
    currency,
    baseAmount: projection.baseAmount,
    amount: projection.finalAmount,
    baseLabel: projection.baseLabel,
    amountLabel: projection.finalLabel,
    multiplier: projection.multiplier,
    campaign: campaign ?? null,
  };
}

export function parseAssistantPptPayoutPreview(
  value: unknown,
): AssistantPptPayoutPreview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    (row.currency !== "MYR" && row.currency !== "ROBUX") ||
    !finiteAmount(row.baseAmount) ||
    !finiteAmount(row.amount) ||
    typeof row.baseLabel !== "string" ||
    typeof row.amountLabel !== "string" ||
    typeof row.multiplier !== "number" ||
    !Number.isFinite(row.multiplier)
  ) {
    return null;
  }

  const rawCampaign = row.campaign;
  const parsedCampaign =
    rawCampaign &&
    typeof rawCampaign === "object" &&
    !Array.isArray(rawCampaign)
      ? (rawCampaign as Record<string, unknown>)
      : null;
  const campaign =
    parsedCampaign &&
    typeof parsedCampaign.slug === "string" &&
    typeof parsedCampaign.name === "string" &&
    typeof parsedCampaign.multiplier === "number" &&
    typeof parsedCampaign.accentColor === "string" &&
    typeof parsedCampaign.endsAt === "string"
      ? {
          slug: parsedCampaign.slug,
          name: parsedCampaign.name,
          multiplier: parsedCampaign.multiplier,
          accentColor: parsedCampaign.accentColor,
          endsAt: parsedCampaign.endsAt,
        }
      : null;

  return {
    currency: row.currency,
    baseAmount: row.baseAmount,
    amount: row.amount,
    baseLabel: row.baseLabel,
    amountLabel: row.amountLabel,
    multiplier: row.multiplier,
    campaign,
  };
}

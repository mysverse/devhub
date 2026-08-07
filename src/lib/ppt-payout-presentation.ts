import type { CurrencyCode } from "./currency";
import { estimateToAmount, formatAmount } from "./currency";
import { applyMultiplier } from "./payout-campaign";

type CampaignMultiplier = { multiplier: number } | null | undefined;

export type PptPayoutProjection = {
  estimate: number | null;
  currency: CurrencyCode;
  multiplier: number;
  boosted: boolean;
  baseAmount: number | null;
  finalAmount: number | null;
  minimumAmount: number;
  maximumAmount: number;
  baseLabel: string;
  finalLabel: string;
};

function amountRangeLabel(
  minimum: number,
  maximum: number,
  currency: CurrencyCode,
) {
  return `${formatAmount(minimum, currency)} – ${formatAmount(maximum, currency)}`;
}

/**
 * The single presentation path for projected PPT value.
 *
 * This is display-only: campaign selection still happens server-side against
 * the developer and issue labels, while the payout engine independently
 * enforces guardrails and locks the winning campaign at first eligibility.
 */
export function projectPptPayout(
  estimate: number | null | undefined,
  currency: CurrencyCode,
  campaign?: CampaignMultiplier,
): PptPayoutProjection {
  const normalizedEstimate =
    typeof estimate === "number" && Number.isFinite(estimate) && estimate > 0
      ? estimate
      : null;
  const multiplier =
    campaign && Number.isFinite(campaign.multiplier) && campaign.multiplier > 1
      ? campaign.multiplier
      : 1;
  const boosted = multiplier > 1;
  const minimumBase = estimateToAmount(1, currency);
  const maximumBase = estimateToAmount(5, currency);
  const minimumAmount = applyMultiplier(minimumBase, multiplier, currency);
  const maximumAmount = applyMultiplier(maximumBase, multiplier, currency);

  if (normalizedEstimate === null) {
    return {
      estimate: null,
      currency,
      multiplier,
      boosted,
      baseAmount: null,
      finalAmount: null,
      minimumAmount,
      maximumAmount,
      baseLabel: amountRangeLabel(minimumBase, maximumBase, currency),
      finalLabel: amountRangeLabel(minimumAmount, maximumAmount, currency),
    };
  }

  const baseAmount = estimateToAmount(normalizedEstimate, currency);
  const finalAmount = applyMultiplier(baseAmount, multiplier, currency);
  return {
    estimate: normalizedEstimate,
    currency,
    multiplier,
    boosted,
    baseAmount,
    finalAmount,
    minimumAmount,
    maximumAmount,
    baseLabel: formatAmount(baseAmount, currency),
    finalLabel: formatAmount(finalAmount, currency),
  };
}

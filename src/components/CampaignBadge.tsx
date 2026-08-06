import { Badge, Text, Tooltip } from "@mantine/core";
import { Sparkles } from "lucide-react";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import {
  type CampaignBadgeInfo,
  formatMultiplier,
} from "@/lib/payout-campaign";

/**
 * The "3x" pill shown next to any amount a live campaign is boosting.
 *
 * Deliberately stateless: it is placed on task cards, board totals and bonus
 * rows, and the campaign is resolved once per page on the server rather than
 * per card on the client.
 */
export type { CampaignBadgeInfo };

export default function CampaignBadge({
  campaign,
  size = "xs",
}: {
  campaign: CampaignBadgeInfo;
  size?: "xs" | "sm";
}) {
  return (
    <Tooltip
      label={`${campaign.name}: every eligible payout pays ${formatMultiplier(campaign.multiplier)} until this campaign ends`}
      withArrow
    >
      <Badge
        size={size}
        variant="light"
        color={campaign.accentColor}
        leftSection={<Sparkles size={size === "xs" ? 10 : 12} />}
      >
        {formatMultiplier(campaign.multiplier)}
      </Badge>
    </Tooltip>
  );
}

/**
 * "RM20 RM60" — the base struck through, the campaign amount beside it.
 * Used wherever a projected earning is shown, so the promo is visible on the
 * number itself rather than only in a banner somebody has already dismissed.
 */
export function CampaignAmount({
  baseAmount,
  currency,
  campaign,
  size = "sm",
}: {
  baseAmount: number;
  currency: CurrencyCode;
  campaign: CampaignBadgeInfo | null;
  size?: "xs" | "sm" | "md";
}) {
  const formattedBase = formatAmount(baseAmount, currency);
  if (!campaign) {
    return (
      <Text component="span" size={size}>
        {formattedBase}
      </Text>
    );
  }

  return (
    <Text component="span" size={size}>
      <Text component="span" size={size} c="dimmed" td="line-through" mr={6}>
        {formattedBase}
      </Text>
      <Text component="span" size={size} fw={600} c={campaign.accentColor}>
        {formatAmount(baseAmount * campaign.multiplier, currency)}
      </Text>
    </Text>
  );
}

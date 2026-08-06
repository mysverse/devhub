import { Badge, Tooltip } from "@mantine/core";
import { Sparkles } from "lucide-react";
import {
  type CampaignBadgeInfo,
  formatMultiplier,
} from "@/lib/payout-campaign";

export type { CampaignBadgeInfo };

/**
 * The "3x" pill shown next to any amount a live campaign is boosting.
 *
 * Deliberately stateless: it sits on task cards, board totals, request rows and
 * bonus caps, and the campaign is resolved once per page on the server rather
 * than per card on the client.
 */
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

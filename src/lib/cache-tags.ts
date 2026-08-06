export const TAGS = {
  workspacePpts: "linear:ppt:workspace",
  userIssues: (linearId: string) => `linear:issues:${linearId}`,
  incentiveConfig: "config:incentive",
  bonusConfig: "config:bonus",
  payoutCampaigns: "config:payout-campaigns",
  incentiveProgress: (userId: string) => `incentives:progress:${userId}`,
} as const;

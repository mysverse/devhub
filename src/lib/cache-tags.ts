export const TAGS = {
  workspacePpts: "linear:ppt:workspace",
  userIssues: (linearId: string) => `linear:issues:${linearId}`,
  incentiveConfig: "config:incentive",
  bonusConfig: "config:bonus",
  incentiveProgress: (userId: string) => `incentives:progress:${userId}`,
} as const;

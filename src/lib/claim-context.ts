import { getResolvedPayoutPolicy } from "./payout-policy-server";
import prisma from "./prisma";

// Everything the pre-claim commitment modal needs to disclose: the viewer's
// current workload and the resolved watch thresholds. Server components fetch
// this once per page and thread it to ClaimButton via TaskCard.

export type ClaimContext = {
  /** Claimed tasks not yet done — ACTIVE/WARNED/SNOOZED/BLOCKED watches. */
  activeCount: number;
  warnHours: number;
  unassignHours: number;
};

export async function getClaimContext(userId: string): Promise<ClaimContext> {
  const policy = getResolvedPayoutPolicy();
  const activeCount = await prisma.pptAssignmentWatch.count({
    where: {
      userId,
      status: { in: ["ACTIVE", "WARNED", "SNOOZED", "BLOCKED"] },
    },
  });
  return {
    activeCount,
    warnHours: policy.warnHours,
    unassignHours: policy.unassignHours,
  };
}

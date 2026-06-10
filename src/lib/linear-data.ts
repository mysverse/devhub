import { cache } from "react";
import { withLinearFallback } from "@/lib/linear";
import {
  fetchAssignedActiveIssues,
  fetchLeaderboardIssues,
  fetchPptBoardIssues,
  fetchSuggestedPpts,
} from "@/lib/linear-queries";

export const getAssignedActiveIssuesForUser = cache(
  async (userId: string, linearId: string) =>
    withLinearFallback(userId, (client) =>
      fetchAssignedActiveIssues(client, linearId),
    ),
);

export const getLeaderboardIssuesForUser = cache(async (userId: string) =>
  withLinearFallback(userId, fetchLeaderboardIssues),
);

export const getSuggestedPptsForUser = cache(async (userId: string) =>
  withLinearFallback(userId, fetchSuggestedPpts),
);

export const getPptBoardIssuesForUser = cache(async (userId: string) =>
  withLinearFallback(userId, fetchPptBoardIssues),
);

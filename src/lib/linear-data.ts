import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { TAGS } from "@/lib/cache-tags";
import { getLinearServiceClient, withLinearFallback } from "@/lib/linear";
import {
  fetchAssignedActiveIssues,
  fetchLeaderboardIssues,
  fetchPptBoardIssues,
  fetchSuggestedPpts,
} from "@/lib/linear-queries";

async function getLeaderboardIssuesCached() {
  "use cache";

  cacheTag(TAGS.workspacePpts);
  cacheLife({ revalidate: 300, expire: 3600 });

  const client = getLinearServiceClient();
  if (!client) {
    throw new Error("LINEAR_SERVICE_API_KEY is required for workspace cache");
  }
  return fetchLeaderboardIssues(client);
}

async function getSuggestedPptsCached() {
  "use cache";

  cacheTag(TAGS.workspacePpts);
  cacheLife({ revalidate: 300, expire: 3600 });

  const client = getLinearServiceClient();
  if (!client) {
    throw new Error("LINEAR_SERVICE_API_KEY is required for workspace cache");
  }
  return fetchSuggestedPpts(client);
}

async function getPptBoardIssuesCached() {
  "use cache";

  cacheTag(TAGS.workspacePpts);
  cacheLife({ revalidate: 300, expire: 3600 });

  const client = getLinearServiceClient();
  if (!client) {
    throw new Error("LINEAR_SERVICE_API_KEY is required for workspace cache");
  }
  return fetchPptBoardIssues(client);
}

async function getAssignedActiveIssuesCached(userId: string, linearId: string) {
  "use cache";

  cacheTag(TAGS.userIssues(linearId));
  cacheLife({ revalidate: 60, expire: 600 });

  return withLinearFallback(userId, (client) =>
    fetchAssignedActiveIssues(client, linearId),
  );
}

export const getAssignedActiveIssuesForUser = cache(
  async (userId: string, linearId: string) =>
    getAssignedActiveIssuesCached(userId, linearId),
);

export const getLeaderboardIssuesForUser = cache(async (userId: string) => {
  if (getLinearServiceClient()) return getLeaderboardIssuesCached();
  return withLinearFallback(userId, fetchLeaderboardIssues);
});

export const getSuggestedPptsForUser = cache(async (userId: string) => {
  if (getLinearServiceClient()) return getSuggestedPptsCached();
  return withLinearFallback(userId, fetchSuggestedPpts);
});

export const getPptBoardIssuesForUser = cache(async (userId: string) => {
  if (getLinearServiceClient()) return getPptBoardIssuesCached();
  return withLinearFallback(userId, fetchPptBoardIssues);
});

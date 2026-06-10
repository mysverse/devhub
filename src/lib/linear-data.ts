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

let warnedNoServiceClient = false;
function serviceClientOrWarn() {
  const client = getLinearServiceClient();
  if (!client && !warnedNoServiceClient) {
    warnedNoServiceClient = true;
    console.warn(
      "[linear-data] LINEAR_SERVICE_API_KEY is not set — workspace PPT data is NOT cached; falling back to per-user live Linear fetches.",
    );
  }
  return client;
}

// Note: the userId React-cache key only matters for the fallback path;
// the service path is workspace-scoped by design.
export const getLeaderboardIssuesForUser = cache(async (userId: string) => {
  if (serviceClientOrWarn()) return getLeaderboardIssuesCached();
  return withLinearFallback(userId, fetchLeaderboardIssues);
});

// Note: the userId React-cache key only matters for the fallback path;
// the service path is workspace-scoped by design.
export const getSuggestedPptsForUser = cache(async (userId: string) => {
  if (serviceClientOrWarn()) return getSuggestedPptsCached();
  return withLinearFallback(userId, fetchSuggestedPpts);
});

// Note: the userId React-cache key only matters for the fallback path;
// the service path is workspace-scoped by design.
export const getPptBoardIssuesForUser = cache(async (userId: string) => {
  if (serviceClientOrWarn()) return getPptBoardIssuesCached();
  return withLinearFallback(userId, fetchPptBoardIssues);
});

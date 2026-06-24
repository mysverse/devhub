import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { ADMIN_ACCESS_WHERE } from "@/lib/authz";
import { TAGS } from "@/lib/cache-tags";
import { getLinearServiceClient, withLinearFallback } from "@/lib/linear";
import {
  fetchAssignedActiveIssues,
  fetchLeaderboardIssues,
  fetchPptBoardIssues,
  fetchSuggestedPpts,
} from "@/lib/linear-queries";
import { IN_APP_CHANNEL, notify } from "@/lib/notifications";
import prisma from "@/lib/prisma";

async function getLeaderboardIssuesCached() {
  "use cache";

  cacheTag(TAGS.workspacePpts);
  cacheLife({ revalidate: 300, expire: 3600 });

  const client = getLinearServiceClient();
  if (!client) {
    throw new Error("LINEAR_SERVICE_API_KEY is required for workspace cache");
  }
  try {
    return await fetchLeaderboardIssues(client);
  } catch (e) {
    // Log here with full fidelity: Next.js masks the message once this throw
    // crosses the "use cache" boundary. Rethrow so the failure is NOT cached and
    // the outer wrapper can degrade to the per-user path.
    console.error(
      "[linear-data] workspace leaderboard fetch via service key failed:",
      e,
    );
    throw e;
  }
}

async function getSuggestedPptsCached() {
  "use cache";

  cacheTag(TAGS.workspacePpts);
  cacheLife({ revalidate: 300, expire: 3600 });

  const client = getLinearServiceClient();
  if (!client) {
    throw new Error("LINEAR_SERVICE_API_KEY is required for workspace cache");
  }
  try {
    return await fetchSuggestedPpts(client);
  } catch (e) {
    console.error(
      "[linear-data] workspace suggested PPTs fetch via service key failed:",
      e,
    );
    throw e;
  }
}

async function getPptBoardIssuesCached() {
  "use cache";

  cacheTag(TAGS.workspacePpts);
  cacheLife({ revalidate: 300, expire: 3600 });

  const client = getLinearServiceClient();
  if (!client) {
    throw new Error("LINEAR_SERVICE_API_KEY is required for workspace cache");
  }
  try {
    return await fetchPptBoardIssues(client);
  } catch (e) {
    console.error(
      "[linear-data] workspace PPT board fetch via service key failed:",
      e,
    );
    throw e;
  }
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

let lastServiceKeyAlertAt = 0;
const SERVICE_KEY_ALERT_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Best-effort, non-blocking admin alert when a workspace fetch via the Linear
 * service key fails (likely a revoked/expired/misconfigured LINEAR_SERVICE_API_KEY).
 * Throttled in-process to once per few minutes, and deduped per-admin to one in-app
 * notification per hour, so a sustained outage cannot spam admins. Never throws —
 * alerting must never break rendering.
 */
async function reportServiceKeyFailure() {
  const now = Date.now();
  if (now - lastServiceKeyAlertAt < SERVICE_KEY_ALERT_THROTTLE_MS) return;
  lastServiceKeyAlertAt = now;

  try {
    const admins = await prisma.userProfile.findMany({
      where: ADMIN_ACCESS_WHERE,
      select: { id: true },
    });
    if (admins.length === 0) return;

    const hourBucket = Math.floor(now / (60 * 60 * 1000));
    await Promise.all(
      admins.map((admin) =>
        notify({
          userId: admin.id,
          domain: "admin_notice",
          type: "LINEAR_SERVICE_KEY_FAILED",
          title: "Linear service key needs attention",
          message:
            "Workspace Linear data couldn't be loaded with the service key (it may be revoked or expired). Members are temporarily served data via their own Linear connection. Please rotate LINEAR_SERVICE_API_KEY.",
          href: "/dashboard/admin",
          dedupeKey: `linear-service-key-down:${admin.id}:${hourBucket}`,
          channels: [IN_APP_CHANNEL],
        }),
      ),
    );
  } catch (err) {
    console.error(
      "[linear-data] failed to alert admins about Linear service key failure:",
      err,
    );
  }
}

// Note: the userId React-cache key only matters for the fallback path;
// the service path is workspace-scoped by design.
export const getLeaderboardIssuesForUser = cache(async (userId: string) => {
  if (serviceClientOrWarn()) {
    try {
      return await getLeaderboardIssuesCached();
    } catch {
      // Service-key path failed (already logged inside the cache). Alert admins
      // and degrade to the signed-in user's own (auto-refreshing) Linear token.
      void reportServiceKeyFailure();
    }
  }
  return withLinearFallback(userId, fetchLeaderboardIssues);
});

// Note: the userId React-cache key only matters for the fallback path;
// the service path is workspace-scoped by design.
export const getSuggestedPptsForUser = cache(async (userId: string) => {
  if (serviceClientOrWarn()) {
    try {
      return await getSuggestedPptsCached();
    } catch {
      void reportServiceKeyFailure();
    }
  }
  return withLinearFallback(userId, fetchSuggestedPpts);
});

// Note: the userId React-cache key only matters for the fallback path;
// the service path is workspace-scoped by design.
export const getPptBoardIssuesForUser = cache(async (userId: string) => {
  if (serviceClientOrWarn()) {
    try {
      return await getPptBoardIssuesCached();
    } catch {
      void reportServiceKeyFailure();
    }
  }
  return withLinearFallback(userId, fetchPptBoardIssues);
});

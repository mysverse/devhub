"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth-utils";
import { hasAdminAccess } from "@/lib/authz";
import { TAGS } from "@/lib/cache-tags";
import { resolveDisplayName } from "@/lib/display-name";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import { fetchIssuesByIds } from "@/lib/linear-queries";
import { isLlmConfigured } from "@/lib/llm";
import { draftPptFromIssue } from "@/lib/llm-suggestions";
import { PROOF_TAG } from "@/lib/payout-policy";
import {
  claimAttachmentsForComment,
  markAttachmentsPosted,
  releaseAttachmentClaim,
} from "@/lib/ppt-comment-attachments";
import {
  evaluatePptIssueById,
  postPptProofComment,
} from "@/lib/ppt-eligibility";
import { hasMeaningfulPptProgress } from "@/lib/ppt-progress";
import { isDevHubGuidanceComment } from "@/lib/ppt-proof";
import prisma from "@/lib/prisma";
import { PROFILE_DISPLAY_SELECT } from "@/lib/prisma-select";

/**
 * Draft a PPT description and estimate from a Linear issue the developer has
 * already picked. Optional by construction: returns { available: false } when
 * the LLM adapter isn't configured, and the form works exactly as before.
 */
export async function draftPptFromLinearIssue(issueId: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  if (!isLlmConfigured()) return { available: false as const };

  try {
    const draft = await withLinearFallback(userId, async (client) => {
      const [issue] = await fetchIssuesByIds(client, [issueId]);
      if (!issue) return null;
      return draftPptFromIssue(
        {
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          labelNames: issue.labelNames,
          estimate: issue.estimate,
        },
        userId,
      );
    });

    if (!draft) return { available: true as const, draft: null };
    return { available: true as const, draft };
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    // Drafting is a convenience; never surface it as a failure of the form.
    return { available: true as const, draft: null };
  }
}

export async function getLinearTeams() {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  try {
    return await withLinearFallback(userId, async (client) => {
      const teams = await client.teams();
      return {
        teams: teams.nodes.map((t) => ({ id: t.id, name: t.name, key: t.key })),
      };
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    return { error: (e as Error).message || "Failed to fetch teams" };
  }
}

export async function getLinearProjects(teamId: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  try {
    return await withLinearFallback(userId, async (client) => {
      const team = await client.team(teamId);
      const projects = await team.projects();
      return {
        projects: projects.nodes.map((p) => ({ id: p.id, name: p.name })),
      };
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    return { error: (e as Error).message || "Failed to fetch projects" };
  }
}

export async function searchLinearUsers(query: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  const needle = query.trim().toLowerCase();
  if (!needle) return { users: [] };

  try {
    return await withLinearFallback(userId, async (client) => {
      const users = await client.users({ first: 50 });
      return {
        users: users.nodes
          .filter((user) => {
            const haystack = [user.name, user.displayName, user.email]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            return haystack.includes(needle);
          })
          .slice(0, 10)
          .map((user) => ({
            id: user.id,
            name: user.displayName || user.name || "Unknown",
            email: user.email ?? null,
            avatarUrl: user.avatarUrl ?? null,
          })),
      };
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    return { error: (e as Error).message || "Failed to search users" };
  }
}

export async function searchLinearIssues(query: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  if (!query.trim()) return { issues: [] };

  try {
    return await withLinearFallback(userId, async (client) => {
      const results = await client.searchIssues(query, { first: 10 });

      // Get existing PPT requests to flag them
      const issueIds = results.nodes.map((i) => i.id);
      const existingRequests = await prisma.pptRequest.findMany({
        where: {
          linearIssueId: { in: issueIds },
          status: { in: ["PENDING", "APPROVED"] },
        },
        select: { linearIssueId: true },
      });
      const requestedIssueIds = new Set(
        existingRequests.map((r) => r.linearIssueId),
      );

      const issues = await Promise.all(
        results.nodes.map(async (searchResult) => {
          // Fetch full issue to access labels
          const issue = await client.issue(searchResult.id);
          const state = await issue.state;
          const labels = await issue.labels();
          const team = await issue.team;
          const hasPptLabel = labels.nodes.some(
            (l) => l.name.toUpperCase() === "PPT",
          );
          return {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            url: issue.url,
            teamId: team?.id ?? "",
            stateType: state?.type ?? "unknown",
            stateName: state?.name ?? "Unknown",
            estimate: issue.estimate ?? null,
            hasPptLabel,
            hasExistingRequest: requestedIssueIds.has(issue.id),
          };
        }),
      );

      // Filter out completed/cancelled issues
      return {
        issues: issues.filter(
          (i) => i.stateType !== "completed" && i.stateType !== "canceled",
        ),
      };
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    return { error: (e as Error).message || "Failed to search issues" };
  }
}

export async function submitPptProof(
  issueId: string,
  body: string,
  attachmentIds: string[] = [],
) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  try {
    const result = await postPptProofComment({
      userId,
      issueId,
      body,
      attachmentIds,
    });

    // Only bust caches once the comment actually landed — a rejected proof
    // never reached Linear, so nothing cached is stale and the extra profile
    // read would be wasted.
    if ("success" in result) {
      // These two tags were missing here while `submitPptProgress` below has
      // always revalidated them, so posting proof left the "use cache" issue
      // lists serving pre-proof state until something else invalidated them.
      // revalidatePath does not reach tag-keyed cache entries, which is why the
      // paths alone were never enough.
      const profile = await prisma.userProfile.findUnique({
        where: { id: userId },
        select: { linearId: true },
      });
      if (profile?.linearId) {
        revalidateTag(TAGS.userIssues(profile.linearId), { expire: 0 });
      }
      revalidateTag(TAGS.workspacePpts, { expire: 0 });
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/ppts");
    revalidatePath("/dashboard/admin");
    return result;
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    const err = e as Error;
    return { error: err.message || "Failed to submit proof" };
  }
}

export async function submitPptProgress(
  issueId: string,
  body: string,
  attachmentIds: string[] = [],
) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  const progressBody = body.trim();
  const hasAttachments = attachmentIds.length > 0;
  // `hasMeaningfulPptProgress` strips the prefilled template headings and asks
  // for ten characters of real prose, which is the right bar for a text-only
  // update. A screenshot changes that calculus: the image *is* the update, and
  // what this comment buys is a reset stale-assignment clock, not a payout —
  // so an attachment stands in for the prose minimum.
  //
  // What an attachment does NOT do is stand in for the update itself. A bare
  // image with an empty body says nothing about what it shows or where the work
  // stands, so attachments alone are still refused. Template-only text plus a
  // screenshot passes: the headings frame the image, and the developer chose to
  // post both.
  const qualifies =
    progressBody.length > 0 &&
    (hasMeaningfulPptProgress(progressBody) || hasAttachments);
  if (!qualifies) {
    return { error: "Add a meaningful progress update before posting." };
  }

  try {
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { linearId: true },
    });
    if (!profile?.linearId) {
      return { error: "Link your Linear account before posting progress." };
    }

    const watch = await prisma.pptAssignmentWatch.findUnique({
      where: {
        linearIssueId_assigneeLinearId: {
          linearIssueId: issueId,
          assigneeLinearId: profile.linearId,
        },
      },
      select: { id: true, status: true },
    });
    if (
      !watch ||
      watch.status === "UNASSIGNED" ||
      watch.status === "RESOLVED"
    ) {
      return { error: "This PPT is not currently watched as your assignment." };
    }

    // Ids in, URLs out: the client never names a URL that goes to Linear, and
    // the compare-and-set inside makes a double submit claim zero the second
    // time. Everything below owes this claim a release if the post fails.
    const claim = await claimAttachmentsForComment({
      userId,
      linearIssueId: issueId,
      kind: "PROGRESS",
      attachmentIds,
    });
    if ("error" in claim) {
      return { error: claim.error };
    }

    const commentBody = claim.markdown
      ? `${progressBody}\n\n${claim.markdown}`
      : progressBody;

    let commentId: string | null = null;
    try {
      commentId = await withLinearFallback(userId, async (client) => {
        const payload = await client.createComment({
          issueId,
          body: commentBody,
        });
        // Synchronous getter on the mutation response. `payload.comment` is a
        // second Linear round trip in production and is unimplemented in the
        // dev mock, so awaiting it would throw after the comment already
        // exists.
        return payload.commentId ?? null;
      });
    } catch (e) {
      // Nothing landed on Linear — give the files back so the retry costs the
      // developer nothing.
      await releaseAttachmentClaim(claim.ids);
      throw e;
    }

    try {
      await markAttachmentsPosted(claim.ids, commentId);
    } catch (error) {
      // Bookkeeping only. The comment exists; reporting this as a failed post
      // would make the developer post a duplicate, which is strictly worse than
      // an attachment row with no linearCommentId stamped on it.
      console.error("Failed to stamp posted PPT progress attachments:", error);
    }

    // Past this point the comment is live, so a throw must NOT release the
    // claim: un-claiming would make already-posted attachments selectable for a
    // second comment.
    await prisma.pptAssignmentWatch.update({
      where: { id: watch.id },
      data: {
        status: "ACTIVE",
        lastActivityAt: new Date(),
        warnedAt: null,
        snoozedUntil: null,
        snoozeReason: null,
      },
    });

    revalidateTag(TAGS.userIssues(profile.linearId), { expire: 0 });
    revalidateTag(TAGS.workspacePpts, { expire: 0 });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/ppts");
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    const err = e as Error;
    return { error: err.message || "Failed to post progress update" };
  }
}

export type PptThreadComment = {
  id: string;
  body: string;
  url: string | null;
  createdAt: string;
  authorName: string;
  isViewer: boolean;
  isProof: boolean;
  isBot: boolean;
};

/**
 * The Linear discussion on a PPT, read back into DevHub so the developer can
 * see the reviewer's reply without leaving the dashboard.
 *
 * Intentionally NOT wrapped in `"use cache"`. The natural cache key is the
 * issue id, but who may read a thread is a per-viewer question — assignee or
 * admin — so a per-issue entry would serve one viewer's authorized fetch to the
 * next viewer, whose own check would never run. Authorization is also settled
 * before the first Linear call for the same reason: an unauthorized caller
 * should not be able to probe which issue ids exist by timing the response.
 */
export async function getPptCommentThread(issueId: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  const viewer = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { linearId: true, role: true, developerRank: true },
  });
  if (!viewer) return { error: "Unauthorized" };

  const isAdmin = hasAdminAccess(viewer);
  if (!isAdmin) {
    if (!viewer.linearId) {
      return { error: "Link your Linear account to read this thread." };
    }
    // Any watch row is enough, in any status — unlike posting, which demands an
    // ACTIVE assignment. A developer whose PPT is RESOLVED (or who has since
    // been unassigned) still needs to read what the reviewer said about the
    // work they delivered.
    const watch = await prisma.pptAssignmentWatch.findUnique({
      where: {
        linearIssueId_assigneeLinearId: {
          linearIssueId: issueId,
          assigneeLinearId: viewer.linearId,
        },
      },
      select: { id: true },
    });
    if (!watch) {
      return { error: "This PPT is not one of your assignments." };
    }
  }

  try {
    const raw = await withLinearFallback(userId, async (client) => {
      const issue = await client.issue(issueId);
      const comments = await issue.comments({ first: 30 });

      const authorIds = [
        ...new Set(
          comments.nodes
            .map((comment) => comment.userId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      // One lookup per distinct author, not per comment — a thread is a handful
      // of people talking, however long it runs. Each is isolated because a
      // single unresolvable author (a deactivated Linear member, or an id the
      // dev mock has no fixture for) must not take the whole thread down.
      const linearAuthors = new Map<
        string,
        { displayName: string | null; name: string | null }
      >();
      await Promise.all(
        authorIds.map(async (id) => {
          try {
            const author = await client.user(id);
            linearAuthors.set(id, {
              displayName: author.displayName ?? null,
              name: author.name ?? null,
            });
          } catch {
            // Falls through to the DevHub profile, then to "Developer".
          }
        }),
      );

      return {
        authorIds,
        linearAuthors,
        comments: comments.nodes.map((comment) => ({
          id: comment.id,
          body: comment.body,
          url: comment.url ?? null,
          createdAt: comment.createdAt,
          userId: comment.userId ?? null,
        })),
      };
    });

    // Kept out of the Linear closure: withLinearFallback replays it on a token
    // refresh, and there is no reason to run the same read twice.
    const profiles = await prisma.userProfile.findMany({
      where: { linearId: { in: raw.authorIds } },
      select: { linearId: true, ...PROFILE_DISPLAY_SELECT },
    });
    const profilesByLinearId = new Map(
      profiles.flatMap((profile) =>
        profile.linearId ? [[profile.linearId, profile] as const] : [],
      ),
    );

    const comments: PptThreadComment[] = raw.comments
      .map((comment) => ({
        id: comment.id,
        body: comment.body,
        url: comment.url,
        createdAt: comment.createdAt.toISOString(),
        // Every name goes through the resolver so a DevHub preferred name wins
        // over the workspace handle, and so a legal name can never be the thing
        // that reaches the browser.
        authorName: resolveDisplayName({
          profile: comment.userId
            ? profilesByLinearId.get(comment.userId)
            : null,
          linear: comment.userId ? raw.linearAuthors.get(comment.userId) : null,
        }),
        isViewer: Boolean(comment.userId && comment.userId === viewer.linearId),
        isProof: comment.body.toLowerCase().includes(PROOF_TAG),
        isBot: isDevHubGuidanceComment(comment.body),
        sortKey: comment.createdAt.getTime(),
      }))
      // Oldest first: a thread reads top to bottom, and the newest reply — the
      // one the developer opened this for — ends up nearest the composer.
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ sortKey: _sortKey, ...comment }) => comment);

    return { comments };
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    const err = e as Error;
    return { error: err.message || "Failed to load the comment thread" };
  }
}

export async function retryPptPayoutCheck(issueId: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  try {
    await evaluatePptIssueById(issueId, { userId, trigger: "developer_retry" });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/ppts");
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    const err = e as Error;
    return { error: err.message || "Failed to retry payout check" };
  }
}

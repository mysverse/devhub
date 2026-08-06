import { LINEAR_STATES, proofCommentBody } from "@/dev/fixtures/linear";
import { PERSONAS } from "@/dev/fixtures/personas";
import { getDevState, stateById } from "@/dev/state";
import { isDevMode } from "@/lib/dev-mode";

/**
 * Dev-mode only: mutate the in-memory mock Linear workspace from outside the
 * server process (the simulate script and browser-driven tests can't touch
 * src/dev/state.ts directly). Returns webhook-shaped data so callers can
 * sign and POST it to /api/webhooks/linear, keeping the mock API and the
 * webhook payload consistent.
 *
 *   POST { identifier: "MYS-201", action: "complete"|"reopen"|"cancel"
 *          |"assign"|"comment", assignee?: "admin"|"developer"|null,
 *          body?: string }
 */
export async function POST(req: Request) {
  if (!isDevMode()) return new Response("Not found", { status: 404 });

  const { identifier, action, assignee, body, label, remove } =
    (await req.json()) as {
      identifier: string;
      action: string;
      assignee?: string | null;
      body?: string;
      label?: string;
      remove?: boolean;
    };

  const { linear } = getDevState();
  const issue = [...linear.issues.values()].find(
    (candidate) => candidate.identifier === identifier,
  );
  if (!issue) {
    return Response.json(
      {
        error: `No mock issue "${identifier}" — see src/dev/fixtures/linear.ts`,
      },
      { status: 404 },
    );
  }

  const now = new Date();
  issue.updatedAt = now;

  switch (action) {
    case "complete":
      issue.stateId = LINEAR_STATES.completed.id;
      issue.completedAt = now;
      issue.canceledAt = null;
      break;
    case "reopen":
      issue.stateId = LINEAR_STATES.started.id;
      issue.completedAt = null;
      issue.canceledAt = null;
      break;
    case "cancel":
      issue.stateId = LINEAR_STATES.canceled.id;
      issue.canceledAt = now;
      issue.completedAt = null;
      break;
    case "label": {
      // Adding or removing a label is how the PPT/bonus collision actually
      // happens in production (approval stamps the PPT label, the webhook
      // re-syncs the bonus candidate). Without this, that path could not be
      // exercised in dev mode at all.
      const name = (label ?? "PPT").trim();
      if (remove) {
        issue.labelNames = issue.labelNames.filter(
          (existing) => existing.toUpperCase() !== name.toUpperCase(),
        );
      } else if (
        !issue.labelNames.some(
          (existing) => existing.toUpperCase() === name.toUpperCase(),
        )
      ) {
        issue.labelNames.push(name);
      }
      break;
    }
    case "assign": {
      const persona = assignee
        ? PERSONAS[assignee as keyof typeof PERSONAS]
        : null;
      issue.assigneeId = persona?.linearId ?? null;
      break;
    }
    case "comment": {
      const comment = {
        id: `comment-dev-${linear.nextCommentNumber++}`,
        body: body ?? proofCommentBody(issue.identifier),
        userId: issue.assigneeId ?? (PERSONAS.developer.linearId as string),
        createdAt: now,
      };
      issue.comments.push(comment);
      return Response.json({
        type: "Comment",
        data: {
          id: comment.id,
          body: comment.body,
          issueId: issue.id,
          userId: comment.userId,
          url: `${issue.url}#comment-${comment.id}`,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      });
    }
    default:
      return Response.json(
        { error: `Unknown action "${action}"` },
        { status: 400 },
      );
  }

  const state = stateById(issue.stateId);
  const assigneeUser = issue.assigneeId
    ? Object.values(PERSONAS).find((p) => p.linearId === issue.assigneeId)
    : null;
  return Response.json({
    type: "Issue",
    data: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      estimate: issue.estimate,
      completedAt: issue.completedAt?.toISOString() ?? null,
      canceledAt: issue.canceledAt?.toISOString() ?? null,
      updatedAt: issue.updatedAt.toISOString(),
      archivedAt: null,
      trashed: false,
      state: { type: state.type, name: state.name },
      assignee: issue.assigneeId
        ? {
            id: issue.assigneeId,
            email: assigneeUser?.email ?? `${issue.assigneeId}@devhub.mock`,
            name: assigneeUser?.name ?? issue.assigneeId,
            displayName: assigneeUser?.name ?? issue.assigneeId,
          }
        : null,
      labels: issue.labelNames.map((name) => ({ name })),
    },
  });
}

import type { DeveloperSpecialtyValue } from "@/lib/developer-access";
import type { RankedTask } from "@/lib/task-recommendation";

// A piece of work somebody could do, before anyone has decided what kind of
// work it is. Pure and client-safe — the same split as task-recommendation.ts
// / -server.ts — so the shape and its mappers stay unit-testable.
//
// Nothing here says "PPT". That is the point: an idea is an artifact, and
// where it goes is a separate decision made by a thin mapper at the bottom of
// this file. Adding a destination means adding a mapper, not a generator.
//
// Why bonuses are not one of those destinations: BonusCandidate.linearIssueId
// is unique and every writer is Linear-sourced, so a candidate cannot exist
// without an issue — and anything DevHub creates carries the PPT label, which
// is a hardcoded permanent bonus exclusion. Bonuses are retrospective by
// construction. The portable route is the artifact: copy the idea into Linear
// by hand WITHOUT the PPT label, and the existing sync picks it up.

export type TaskIdeaOrigin =
  /** Came from the deterministic ranker. Needs no API key; always available. */
  | "ranker"
  /** Came from the model. */
  | "model";

export type TaskIdeaAnchor =
  | {
      kind: "existing";
      linearIssueId: string;
      identifier: string;
      url: string | null;
      /** Already a PPT — the action is "claim", not "request". */
      hasPptLabel: boolean;
      /** A PENDING/APPROVED PptRequest already covers it. */
      hasExistingRequest: boolean;
      /**
       * A live bonus candidate sits on this issue. Converting it to a PPT
       * destroys that, so the UI must say so before anyone clicks.
       */
      hasLiveBonusCandidate: boolean;
    }
  | {
      kind: "original";
      teamId: string | null;
      projectId: string | null;
      projectName: string | null;
    };

export type TaskIdeaWikiReference = {
  game: string;
  slug: string;
  articleTitle: string;
  canonicalUrl: string;
};

export type TaskIdea = {
  /** Stable within one batch; keys selection and conversion. */
  ref: string;
  title: string;
  /** Two or three sentences of prose. Becomes the top of the description. */
  scope: string;
  acceptanceCriteria: string[];
  /**
   * DevHub complexity, 1-5. NEVER a raw Linear point value: IssueDTO.estimate
   * has already been through linearEstimateToComplexityLevel, and approval
   * maps back the other way. A leaked 8 surfaces as a confusing form error.
   */
  estimate: number;
  specialty: DeveloperSpecialtyValue | null;
  /** Why this, for this person. Never empty — same contract as RankedTask. */
  because: string;
  origin: TaskIdeaOrigin;
  anchor: TaskIdeaAnchor;
  wikiReference?: TaskIdeaWikiReference | null;
};

/** DevHub's complexity scale. Anything outside it is not submittable. */
export const MIN_ESTIMATE = 1;
export const MAX_ESTIMATE = 5;

export function clampEstimate(value: number | null | undefined) {
  if (!Number.isFinite(value ?? Number.NaN)) return 2;
  return Math.min(MAX_ESTIMATE, Math.max(MIN_ESTIMATE, Math.round(value ?? 2)));
}

/**
 * The description body an idea becomes, wherever it lands. Shared so a PPT
 * request and a hand-pasted Linear issue read identically.
 */
export function ideaDescriptionMarkdown(idea: TaskIdea): string {
  const parts = [idea.scope.trim()];
  if (idea.acceptanceCriteria.length > 0) {
    parts.push(
      "## Acceptance criteria",
      ...idea.acceptanceCriteria.map((line) => `- ${line}`),
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Everything a human needs to paste this into Linear themselves. Used for the
 * bonus route, so the copy deliberately carries no PPT label and no promise
 * of payment.
 */
export function ideaClipboardText(idea: TaskIdea): string {
  return [idea.title, "", ideaDescriptionMarkdown(idea)].join("\n");
}

/** The PPT request modal's state, as far as an idea can fill it in. */
export type PptRequestPrefill = {
  mode: "new" | "existing";
  existingIssueId: string | null;
  newTitle: string;
  description: string;
  /** String because the modal holds it as one. */
  estimate: string;
  ideaRef: string;
};

/**
 * Map an idea onto the request form.
 *
 * Deliberately absent: the due date. The modal makes it required to advance,
 * and the server only checks that it parses — not that it is in the future —
 * so leaving it blank is the only thing standing between a generated idea and
 * a past-dated request. A human picks it.
 */
export function pptRequestPrefillFromIdea(idea: TaskIdea): PptRequestPrefill {
  return {
    mode: idea.anchor.kind === "existing" ? "existing" : "new",
    existingIssueId:
      idea.anchor.kind === "existing" ? idea.anchor.linearIssueId : null,
    newTitle: idea.title,
    description: ideaDescriptionMarkdown(idea),
    estimate: String(clampEstimate(idea.estimate)),
    ideaRef: idea.ref,
  };
}

/** Can this idea be turned into a PPT request at all? */
export function ideaBlockedReason(idea: TaskIdea): string | null {
  if (idea.anchor.kind !== "existing") return null;
  if (idea.anchor.hasPptLabel) {
    return "Already a PPT — claim it from the board instead.";
  }
  if (idea.anchor.hasExistingRequest) {
    return "A PPT request already covers this issue.";
  }
  return null;
}

/** The existing ranker, expressed as an idea so both feed one surface. */
export function rankedTaskToIdea(
  ranked: RankedTask,
  extras: {
    url?: string | null;
    hasPptLabel?: boolean;
    hasExistingRequest?: boolean;
    hasLiveBonusCandidate?: boolean;
  } = {},
): TaskIdea {
  return {
    ref: `ranker:${ranked.task.id}`,
    title: ranked.task.title,
    scope: ranked.task.description?.trim() || "Open on the PPT board.",
    acceptanceCriteria: [],
    estimate: clampEstimate(ranked.task.estimate),
    specialty: ranked.matchedSpecialties[0] ?? null,
    because: ranked.because,
    origin: "ranker",
    anchor: {
      kind: "existing",
      linearIssueId: ranked.task.id,
      identifier: ranked.task.identifier,
      url: extras.url ?? null,
      // Ranker ideas come off the open PPT board, so the label is a given.
      hasPptLabel: extras.hasPptLabel ?? true,
      hasExistingRequest: extras.hasExistingRequest ?? false,
      hasLiveBonusCandidate: extras.hasLiveBonusCandidate ?? false,
    },
  };
}

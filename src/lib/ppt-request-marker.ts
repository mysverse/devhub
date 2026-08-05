/**
 * Marks the DevHub-authored footer on a Linear issue description, so it can be
 * recognised later without matching prose. Mirrors
 * DEVHUB_ASSIGNMENT_WATCH_COMMENT_MARKER in src/lib/ppt-assignment-watch.ts.
 *
 * Lives here rather than beside approvedIssueDescription() because that file
 * carries the "use server" directive, where every export must be an async
 * function — a plain const there silently strips the module of all its exports.
 */
export const DEVHUB_PPT_REQUEST_DESCRIPTION_MARKER =
  "<!-- devhub:ppt-request -->";

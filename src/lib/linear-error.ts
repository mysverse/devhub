import { redirect } from "next/navigation";
import { LinearReauthRequiredError } from "@/lib/linear";

/** User-facing copy shown when a Linear fetch fails for a non-auth reason. */
export const LINEAR_FETCH_ERROR_MESSAGE =
  "We couldn't load this from Linear right now. Please try again shortly.";

/**
 * Standard handling for a failed Linear fetch inside a server component's catch.
 *
 * - On `LinearReauthRequiredError`, redirects to the reconnect-Linear flow
 *   (this throws, so the function does not return in that case).
 * - Otherwise logs the error and returns a safe, user-facing message. Never
 *   surface the raw `error.message`: when a Linear failure crosses a `"use cache"`
 *   boundary, Next.js masks it to "An error occurred in the Server Components
 *   render…", which is meaningless to users.
 *
 * @param returnTo path to return to after a successful Linear reconnect
 * @param context optional label included in the server log for diagnostics
 */
export function resolveLinearFetchError(
  error: unknown,
  returnTo: string,
  context?: string,
): string {
  if (error instanceof LinearReauthRequiredError) {
    redirect(`/auth/reauth-linear?returnTo=${encodeURIComponent(returnTo)}`);
  }
  console.error(`Linear fetch failed${context ? ` (${context})` : ""}:`, error);
  return LINEAR_FETCH_ERROR_MESSAGE;
}

/**
 * Map a failed Linear mutation (claim, release, comment) to a user-facing
 * message for a server action's error return. Never surface the raw SDK
 * `error.message` — it leaks GraphQL internals and reads as a crash. Callers
 * log the raw error themselves before mapping.
 */
export function describeLinearMutationError(
  error: unknown,
  fallback: string,
): string {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  if (message.includes("not found") || message.includes("does not exist")) {
    return "This task no longer exists in Linear. Refresh the board and try again.";
  }
  if (
    message.includes("permission") ||
    message.includes("forbidden") ||
    message.includes("not allowed") ||
    message.includes("unauthorized")
  ) {
    return "Your Linear account doesn't have permission for this — reconnect Linear from settings or ask an admin.";
  }
  if (message.includes("rate limit") || message.includes("ratelimit")) {
    return "Linear is rate-limiting requests right now. Try again in a minute.";
  }
  return fallback;
}

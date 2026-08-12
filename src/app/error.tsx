"use client";

import RouteError from "@/components/RouteError";

/**
 * Root-segment boundary. Without this, anything thrown outside /dashboard —
 * /onboarding, a policy page, or the dashboard LAYOUT itself, whose promises
 * are created above dashboard/error.tsx — fell through to global-error.tsx,
 * which replaces the root layout with an unstyled dark box that has no nav.
 *
 * This still renders inside the root layout, so it keeps Mantine and the app
 * chrome. global-error.tsx remains for the genuinely catastrophic case: a
 * throw in the root layout itself.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} />;
}

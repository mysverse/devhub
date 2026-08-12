"use client";

import LinkButton from "@/components/LinkButton";
import RouteError from "@/components/RouteError";

/**
 * Dashboard segment boundary.
 *
 * It previously told every user to reconnect their Linear account. That is
 * wrong for the failure this box actually sees most: a transient database
 * fault, which no amount of re-authorising fixes — and it sent people to
 * re-authorise an integration that was working. Reconnecting is still offered,
 * but as one option rather than the diagnosis.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      description="We couldn't load this page. It is usually temporary, so try again first."
      actions={
        <>
          <LinkButton href="/dashboard" variant="light">
            Back to overview
          </LinkButton>
          <LinkButton
            href="/auth/reauth-linear?returnTo=/dashboard"
            variant="subtle"
          >
            Reconnect Linear
          </LinkButton>
        </>
      }
    />
  );
}

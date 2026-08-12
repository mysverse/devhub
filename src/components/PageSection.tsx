import { Suspense } from "react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

/**
 * One independently-failing section of a page.
 *
 * A `<Suspense>` boundary is NOT an error boundary: a throw inside one
 * propagates to the nearest *error* boundary, so ten Suspense subtrees on the
 * dashboard still failed as a unit and blanked the whole page. This pairs each
 * subtree with its own boundary so a failure costs one card.
 *
 * Use this where the subtree is already its own component. Where several
 * independent awaits live inside ONE component that must render partial
 * results — the admin payout board, which needs the failure as a *value* to
 * mark the right tab — use `loadSection` from section-result.ts instead.
 * Threading loadSection's per-section DTO through ten dashboard sections would
 * be dozens of props for nothing.
 */
export default function PageSection({
  children,
  fallback = null,
  title,
}: {
  children: React.ReactNode;
  /** Skeleton shown while the section streams. */
  fallback?: React.ReactNode;
  /** Named in the failure card, so a user can say which part is broken. */
  title?: string;
}) {
  return (
    <SectionErrorBoundary title={title}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </SectionErrorBoundary>
  );
}

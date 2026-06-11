"use client";

import { AnimateView } from "motion-plus/animate-view";
import { DURATION, EASE } from "@/components/animations";

/**
 * Shared-element boundary for page titles: every PageHeader title shares the
 * "page-title" view-transition name, so navigating between dashboard pages
 * morphs the old title into the new one instead of crossfading the whole
 * header. (Client wrapper because AnimateView reads React.ViewTransition.)
 */
export default function PageTitleTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AnimateView
      name="page-title"
      share={{ transition: { duration: DURATION.base, ease: EASE.inOut } }}
    >
      {children}
    </AnimateView>
  );
}

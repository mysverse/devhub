"use client";

import { AnimateView } from "motion-plus/animate-view";
import { DURATION, EASE } from "@/components/animations";

/**
 * Dashboard route transition boundary. A template remounts per navigation, so
 * AnimateView (React ViewTransition driven by Motion) gets a true paired
 * exit-of-old-page + enter-of-new-page on every dashboard route change.
 *
 * Requires `experimental.viewTransition` in next.config.ts (experimental
 * React channel — AnimateView reads React.ViewTransition). Revert the two
 * together if needed. View transitions never run on initial load; first-paint
 * entrance still comes from each page's own FadeIn/Stagger.
 *
 * The boundary sits inside the AppShell main container, so the persistent
 * header/nav (and its layoutId nav indicator) stays live during transitions.
 */
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AnimateView
      enter={{
        opacity: [0, 1],
        y: [10, 0],
        transition: { duration: DURATION.base, ease: EASE.out },
      }}
      exit={{
        opacity: [1, 0],
        transition: { duration: DURATION.fast, ease: EASE.out },
      }}
    >
      {children}
    </AnimateView>
  );
}

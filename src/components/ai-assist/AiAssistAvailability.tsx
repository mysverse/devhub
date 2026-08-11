"use client";

import { createContext, useContext } from "react";

/**
 * Whether writing help is configured, carried down the dashboard shell.
 *
 * The value is still computed on the server — `isLlmConfigured()` in
 * `src/app/dashboard/layout.tsx`, the same place `isAssistantConfigured()` is
 * already read — and a client component never touches env. This exists because
 * the alternative is threading one boolean through TaskCard, ActiveTasks,
 * SuggestedPPTs, the board, five admin tabs and two shared button components,
 * where every intermediate hop is a chance to forget it and ship a button that
 * calls an unconfigured adapter.
 *
 * Defaults to false, so a field mounted outside the dashboard shell renders no
 * affordance rather than a broken one.
 */
const AiAssistAvailabilityContext = createContext(false);

export function AiAssistAvailabilityProvider({
  available,
  children,
}: {
  available: boolean;
  children: React.ReactNode;
}) {
  return (
    <AiAssistAvailabilityContext.Provider value={available}>
      {children}
    </AiAssistAvailabilityContext.Provider>
  );
}

export function useAiAssistAvailable() {
  return useContext(AiAssistAvailabilityContext);
}

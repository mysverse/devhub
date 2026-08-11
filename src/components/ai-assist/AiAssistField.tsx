"use client";

import { Stack, VisuallyHidden } from "@mantine/core";
import { useState } from "react";
import AiAssistBar from "./AiAssistBar";
import AiAssistConcerns from "./AiAssistConcerns";
import { type UseAiAssistOptions, useAiAssist } from "./useAiAssist";

/**
 * Drop-in writing help for a field that has no opinion about where the pieces
 * go — which is every field except the PPT composer, whose checklist owns that
 * part of the layout.
 *
 * Renders nothing when the adapter is unconfigured, exactly like the existing
 * "Draft from issue" button. Availability is a prop, computed server-side;
 * client components never read env.
 */
export default function AiAssistField(
  options: Omit<UseAiAssistOptions, "onAnnounce">,
) {
  const [live, setLive] = useState("");
  const assist = useAiAssist({ ...options, onAnnounce: setLive });
  if (!assist.visible) return null;

  return (
    <Stack gap="xs" mt={6}>
      <AiAssistBar assist={assist} compact />
      {assist.review && (
        <AiAssistConcerns
          review={assist.review}
          onDismiss={assist.dismissReview}
        />
      )}
      <VisuallyHidden aria-live="polite">{live}</VisuallyHidden>
    </Stack>
  );
}

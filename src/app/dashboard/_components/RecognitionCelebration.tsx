"use client";

import { useEffect, useRef, useState } from "react";
import { markMyAchievementsSeen } from "@/app/dashboard/actions";
import ConfettiBurst from "@/components/ConfettiBurst";
import type { AchievementKey } from "@/lib/achievements";

/**
 * One-time celebration for unseen achievements: confetti fires ONLY for
 * FIRST_PAYOUT (the moment worth celebrating loudly); everything else already
 * arrived as a quiet toast. Marks achievements seen so nothing repeats.
 */
export default function RecognitionCelebration({
  unseenKeys,
}: {
  unseenKeys: AchievementKey[];
}) {
  const [celebrate] = useState(() => unseenKeys.includes("FIRST_PAYOUT"));
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current || unseenKeys.length === 0) return;
    marked.current = true;
    void markMyAchievementsSeen();
  }, [unseenKeys]);

  if (!celebrate) return null;
  return <ConfettiBurst particleCount={36} />;
}

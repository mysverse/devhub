"use client";

import { motion } from "motion/react";
import { EASE } from "@/components/animations";

export default function AnimatedProgressBar({
  completedPct,
  inProgressPct,
  delay,
}: {
  completedPct: number;
  inProgressPct: number;
  delay: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        height: 6,
        borderRadius: 3,
        overflow: "hidden",
        background: "var(--mantine-color-dark-5)",
      }}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${completedPct}%` }}
        transition={{ duration: 0.9, delay: delay + 0.2, ease: EASE.out }}
        style={{
          flexShrink: 0,
          background: "var(--mantine-color-green-5)",
        }}
      />
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${inProgressPct}%` }}
        transition={{ duration: 0.9, delay: delay + 0.4, ease: EASE.out }}
        style={{
          flexShrink: 0,
          background: "var(--mantine-color-yellow-5)",
        }}
      />
    </div>
  );
}

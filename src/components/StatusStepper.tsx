"use client";

import { Box, Group, Text } from "@mantine/core";
import { Check, CircleDashed, Pause } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ComponentType } from "react";

export type StatusStep = {
  key: string;
  label: string;
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
};

type Props = {
  steps: StatusStep[];
  /** Index of the step currently reached. -1 draws every step as not started. */
  currentIndex: number;
  /**
   * The current step is reached but not moving — a hold. Drawn amber, with a
   * pause mark and no pulse, because a paused step that still pulses reads as
   * progress.
   */
  paused?: boolean;
  /** Smaller circles and labels, for a list of several trackers. */
  compact?: boolean;
};

/**
 * The horizontal "where is this in its journey" tracker, extracted from the
 * welcome-pack order timeline so incentive rewards can use the same one.
 *
 * A tracker is worth more than a status badge here because it answers the
 * question the badge kept raising — is this normal, and what happens next —
 * without a legend. The paused variant exists so a held reward is visibly the
 * same journey, stopped, rather than a different status to look up.
 */
export default function StatusStepper({
  steps,
  currentIndex,
  paused = false,
  compact = false,
}: Props) {
  // The infinite pulse animates opacity, which MotionConfig's
  // reducedMotion="user" does not suppress — gate it explicitly.
  const reducedMotion = useReducedMotion();
  const size = compact ? 24 : 32;
  const iconSize = compact ? 12 : 16;
  const activeColor = paused
    ? "var(--mantine-color-orange-6)"
    : "var(--mantine-color-blue-6)";

  return (
    <Group gap={0} wrap="nowrap" align="flex-start" w="100%">
      {steps.map((step, index) => {
        const isComplete = index <= currentIndex;
        const isCurrent = index === currentIndex;
        const isLast = index === steps.length - 1;
        const Icon = step.icon;
        return (
          <Box
            key={step.key}
            style={{
              flex: isLast ? 0 : 1,
              minWidth: isLast ? size : 0,
            }}
          >
            <Group gap="xs" wrap="nowrap" align="center">
              <motion.div
                initial={false}
                animate={
                  isComplete
                    ? { scale: 1, opacity: 1 }
                    : { scale: 0.95, opacity: 0.6 }
                }
                transition={{ type: "spring", stiffness: 240, damping: 22 }}
                style={{
                  width: size,
                  height: size,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isComplete
                    ? activeColor
                    : "var(--mantine-color-dark-5)",
                  color: "white",
                  flexShrink: 0,
                  position: "relative",
                  boxShadow: isCurrent
                    ? `0 0 0 4px ${
                        paused
                          ? "rgba(253, 126, 20, 0.18)"
                          : "rgba(34, 139, 230, 0.18)"
                      }`
                    : "none",
                }}
              >
                {isCurrent && !paused && !reducedMotion && (
                  <motion.div
                    aria-hidden
                    animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
                    transition={{
                      duration: 1.6,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeOut",
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "50%",
                      backgroundColor: activeColor,
                    }}
                  />
                )}
                {isComplete ? (
                  isCurrent ? (
                    paused ? (
                      <Pause size={iconSize} strokeWidth={2.4} />
                    ) : Icon ? (
                      <Icon size={iconSize} strokeWidth={2.4} />
                    ) : (
                      <Check size={iconSize} strokeWidth={3} />
                    )
                  ) : (
                    <Check size={iconSize} strokeWidth={3} />
                  )
                ) : (
                  <CircleDashed size={iconSize} />
                )}
              </motion.div>
              {!isLast && (
                <Box
                  style={{
                    flex: 1,
                    height: 2,
                    backgroundColor: "var(--mantine-color-dark-5)",
                    position: "relative",
                    overflow: "hidden",
                    minWidth: 12,
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: index < currentIndex ? "100%" : "0%" }}
                    transition={{
                      duration: 0.55,
                      ease: "easeOut",
                      delay: index * 0.06,
                    }}
                    style={{ height: "100%", backgroundColor: activeColor }}
                  />
                </Box>
              )}
            </Group>
            {/* The last label is anchored to the right edge of its circle
                rather than flowing left-to-right off it: with nothing after it
                to take up the slack, a left-aligned label overflows the card
                and gets clipped mid-word. */}
            <Box
              mt={compact ? 4 : 8}
              style={
                isLast ? { position: "relative", height: 16 } : { height: 16 }
              }
            >
              <Text
                size="xs"
                fw={isCurrent ? 600 : 400}
                c={isComplete ? undefined : "dimmed"}
                style={{
                  whiteSpace: "nowrap",
                  ...(isLast ? { position: "absolute", right: 0, top: 0 } : {}),
                }}
              >
                {step.label}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Group>
  );
}

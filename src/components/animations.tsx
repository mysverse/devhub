"use client";

import { Card, type CardProps } from "@mantine/core";
import {
  AnimatePresence,
  motion,
  type Transition,
  type Variants,
} from "motion/react";
import { AnimateNumber, type AnimateNumberProps } from "motion-plus/react";
import { forwardRef, useEffect, useState } from "react";

/**
 * Shared motion language for the app. Importing from here ensures every page
 * fades, slides, lifts, and springs with the same character.
 *
 * Plain-CSS transitions use the mirrored tokens in src/app/globals.css
 * (--duration-fast/base/slow, --ease-out/in-out) — keep the two in sync.
 *
 * Which preset when:
 * - Page/section entrance      → FadeIn, or StaggerContainer + StaggerItem
 * - Hover lift / press on card → MotionCard (or whileHover/whileTap + SPRING.snappy)
 * - Button press feedback      → global `:active` rule in globals.css; never per-button
 * - CSS-only hovers            → `var(--duration-fast) var(--ease-out)`
 * - Numeric value changes      → AnimatedNumber
 * - Wizard / step content      → StepTransition
 * - Modals / drawers           → MODAL_TRANSITION / "slide-left" + OVERLAY_PROPS
 * - Conditional content        → AnimatedCollapse (no layout pop)
 * - Client list add/remove     → <AnimatePresence mode="popLayout" initial={false}>
 *                                + AnimatedListItem
 */
export const EASE = {
  /** Material-ish exit-to-rest. Good default for transform-only motion. */
  out: [0.16, 1, 0.3, 1],
  /** Symmetric ease for two-way transitions. */
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const DURATION = {
  fast: 0.2,
  base: 0.3,
  slow: 0.45,
} as const;

export const SPRING = {
  /** Gentle spring for entrance animations. */
  soft: { type: "spring" as const, stiffness: 110, damping: 18 },
  /** Snappier spring for hover/press feedback. */
  snappy: { type: "spring" as const, stiffness: 280, damping: 22 },
  /** Bouncy spring for celebratory pops. */
  pop: { type: "spring" as const, stiffness: 320, damping: 18 },
} as const;

export const FADE_UP_ANIMATION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: SPRING.soft },
};

export const STAGGER_CHILD_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: SPRING.soft },
};

/**
 * Variants for stepper/wizard step transitions. Pair with `<AnimatePresence
 * mode="wait" initial={false}>` and a key bound to the active step. Direction
 * is left-to-right for forward motion.
 */
export const STEP_VARIANTS: Variants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

/**
 * Direction-aware variant of STEP_VARIANTS: pass `custom={1}` for forward
 * navigation and `custom={-1}` for backward so the slide matches the user's
 * direction of travel.
 */
export const DIRECTIONAL_STEP_VARIANTS: Variants = {
  initial: (direction: 1 | -1) => ({ opacity: 0, x: 24 * direction }),
  animate: { opacity: 1, x: 0 },
  exit: (direction: 1 | -1) => ({ opacity: 0, x: -24 * direction }),
};

export const STEP_TRANSITION: Transition = {
  duration: DURATION.base,
  ease: EASE.out,
};

export const MODAL_TRANSITION = {
  transition: "pop" as const,
  duration: 160,
};

export const OVERLAY_PROPS = {
  blur: 4,
  backgroundOpacity: 0.55,
} as const;

export function StaggerContainer({
  children,
  className,
  staggerChildren = 0.08,
  delayChildren = 0,
}: {
  children: React.ReactNode;
  className?: string;
  staggerChildren?: number;
  delayChildren?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      viewport={{ once: true }}
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren, delayChildren },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={STAGGER_CHILD_VARIANTS} className={className}>
      {children}
    </motion.div>
  );
}

export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={FADE_UP_ANIMATION_VARIANTS}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function ScaleIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...SPRING.soft, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Wraps step content for a stepper that uses AnimatePresence. The caller
 * supplies the active step value via `step` (used as the React key) — children
 * change as `step` changes, and the animation runs automatically.
 *
 * <StepTransition step={active}>
 *   {renderStepContent(active)}
 * </StepTransition>
 */
export function StepTransition({
  step,
  children,
  className,
  minHeight,
  direction = 1,
}: {
  step: string | number;
  children: React.ReactNode;
  className?: string;
  /** Optional fixed min-height (px) to prevent layout jank during transitions. */
  minHeight?: number;
  /** 1 = forward (slide left), -1 = backward (slide right). */
  direction?: 1 | -1;
}) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        minHeight,
      }}
    >
      {/* custom must be on AnimatePresence too — exit variants resolve from it. */}
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={DIRECTIONAL_STEP_VARIANTS}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={STEP_TRANSITION}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * A Mantine Card wrapped in a motion.div with a subtle hover lift. Use this in
 * grid layouts where cards are clickable or otherwise the focal interaction —
 * payouts, tasks, items, etc. Keeps card props pass-through.
 */
type MotionCardProps = CardProps & {
  hoverLift?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export const MotionCard = forwardRef<HTMLDivElement, MotionCardProps>(
  function MotionCard(
    { hoverLift = true, className, children, style, ...cardProps },
    ref,
  ) {
    return (
      <motion.div
        ref={ref}
        className={className}
        whileHover={hoverLift ? { y: -3 } : undefined}
        whileTap={{ scale: 0.985 }}
        transition={SPRING.snappy}
        style={{ height: "100%" }}
      >
        <Card {...cardProps} style={style} h="100%">
          {children}
        </Card>
      </motion.div>
    );
  },
);

/**
 * Animates conditional content open/closed instead of letting it pop in and
 * shift the layout. Children stay mounted while visible; when `opened` flips
 * the height/opacity animate.
 *
 *   <AnimatedCollapse opened={expanded}>{details}</AnimatedCollapse>
 *
 * Cannot wrap a TableTr (table rows can't height-animate) — for tables, put
 * the AnimatedCollapse around the CONTENT of a cell inside a borderless row.
 */
export function AnimatedCollapse({
  opened,
  children,
  className,
}: {
  opened: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={false}
      animate={
        opened ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }
      }
      transition={{ duration: DURATION.fast, ease: EASE.out }}
      style={{ overflow: "hidden" }}
      className={className}
      aria-hidden={!opened}
    >
      {children}
    </motion.div>
  );
}

/**
 * List item with enter/exit/reorder animation. Use inside
 * `<AnimatePresence mode="popLayout" initial={false}>`; siblings glide into
 * place via the layout animation when items are added or removed.
 */
export function AnimatedListItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={SPRING.snappy}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format?: AnimateNumberProps["format"];
}) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    setDisplayed(value);
  }, [value]);

  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      <AnimateNumber format={format}>{displayed}</AnimateNumber>
    </span>
  );
}

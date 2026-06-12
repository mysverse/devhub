"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

const COLORS = [
  "var(--mantine-color-teal-5)",
  "var(--mantine-color-cyan-5)",
  "var(--mantine-color-lime-5)",
  "var(--mantine-color-blue-5)",
  "var(--mantine-color-yellow-5)",
];

type Particle = {
  id: number;
  color: string;
  size: number;
  round: boolean;
  tx: number;
  ty: number;
  rotate: number;
  duration: number;
  delay: number;
};

/**
 * One-shot celebratory confetti burst, anchored to (and absolutely
 * positioned over) its parent. Transform/opacity-only so it never causes
 * layout work; removes itself after the burst finishes.
 */
export default function ConfettiBurst({
  particleCount = 24,
}: {
  particleCount?: number;
}) {
  const reducedMotion = useReducedMotion();
  const [done, setDone] = useState(false);

  // Particle specs are computed once — no per-frame allocation.
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: particleCount }, (_, i) => ({
        id: i,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 3,
        round: i % 3 === 0,
        tx: (Math.random() - 0.5) * 220,
        ty: -(50 + Math.random() * 100),
        rotate: 180 + Math.random() * 540,
        duration: 0.9 + Math.random() * 0.4,
        delay: Math.random() * 0.12,
      })),
    [particleCount],
  );

  const totalMs = 1500;
  useEffect(() => {
    if (reducedMotion) return;
    const timer = setTimeout(() => setDone(true), totalMs);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  // MotionConfig would suppress the transforms but leave an opacity-only
  // ghost — skip entirely under reduced motion.
  if (reducedMotion || done) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{
            x: [0, p.tx],
            // Up with the burst, then gravity pulls the third keyframe down.
            y: [0, p.ty, p.ty + 130],
            rotate: [0, p.rotate],
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeOut",
          }}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: p.size,
            height: p.round ? p.size : p.size * 0.6,
            borderRadius: p.round ? "50%" : 1,
            backgroundColor: p.color,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </div>
  );
}

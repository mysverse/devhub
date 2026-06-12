"use client";

import { Card, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { SPRING } from "@/components/animations";
import ConfettiBurst from "@/components/ConfettiBurst";
import { JUST_SUBMITTED_FLAG } from "./OrderForm";

/**
 * One-time celebration banner shown at the top of the status view right
 * after submission. The order form sets a sessionStorage flag before the
 * page revalidates; we consume it here so refreshes and later visits render
 * nothing.
 */
export default function SuccessCelebration() {
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(JUST_SUBMITTED_FLAG) === "1") {
        sessionStorage.removeItem(JUST_SUBMITTED_FLAG);
        setVisible(true);
      }
    } catch {
      // sessionStorage unavailable — skip the celebration.
    }
  }, []);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING.soft}
    >
      <Card
        withBorder
        radius="md"
        p="lg"
        mb="md"
        style={{ borderColor: "var(--mantine-color-teal-7)" }}
      >
        <Group gap="md" wrap="nowrap">
          <div style={{ position: "relative" }}>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ ...SPRING.pop, delay: 0.15 }}
              onAnimationComplete={() => {
                if (!reducedMotion) setBurst(true);
              }}
            >
              <ThemeIcon color="teal" size={44} radius="xl" variant="light">
                <Check size={24} strokeWidth={3} />
              </ThemeIcon>
            </motion.div>
            {burst && <ConfettiBurst />}
          </div>
          <Stack gap={2}>
            <Text fw={600}>Order submitted</Text>
            <Text size="sm" c="dimmed">
              We&apos;ll email you at each step — approval, shipping, and
              delivery.
            </Text>
          </Stack>
        </Group>
      </Card>
    </motion.div>
  );
}

"use client";

import { motion } from "motion/react";
import { EASE } from "@/components/animations";

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE.out }}
    >
      {children}
    </motion.div>
  );
}

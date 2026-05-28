"use client";

import { Badge } from "@mantine/core";
import { Code } from "lucide-react";

export default function DevModeBanner() {
  if (process.env.NEXT_PUBLIC_DEV_MODE !== "true") return null;

  return (
    <Badge
      size="lg"
      variant="filled"
      color="orange"
      leftSection={<Code size={14} />}
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9999,
        opacity: 0.85,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      DEV MODE
    </Badge>
  );
}

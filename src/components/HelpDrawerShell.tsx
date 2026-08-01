"use client";

import {
  Anchor,
  Drawer,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ArrowRight, HelpCircle } from "lucide-react";
import type React from "react";

type HelpDrawerShellProps = {
  /** Trigger text, e.g. "How payouts work". Also the drawer title by default. */
  triggerLabel: string;
  title?: string;
  children: React.ReactNode;
  /** Footer link to the full guide; pass null to omit. */
  guideHref?: string | null;
};

const DEFAULT_GUIDE_HREF = "/dashboard/help";

/**
 * Canonical per-page help drawer: the standard trigger (help icon + label +
 * arrow) opening a right-side drawer. Every page-level "How X works"
 * explainer uses this shell so help looks and behaves the same everywhere.
 */
export default function HelpDrawerShell({
  triggerLabel,
  title,
  children,
  guideHref = DEFAULT_GUIDE_HREF,
}: HelpDrawerShellProps) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <UnstyledButton
        onClick={open}
        style={{
          color: "inherit",
          display: "inline-flex",
          width: "fit-content",
        }}
      >
        <Group gap={6}>
          <HelpCircle size={14} />
          <Text fz="sm" c="blue.4" fw={500}>
            {triggerLabel}
          </Text>
          <ArrowRight size={12} />
        </Group>
      </UnstyledButton>

      <Drawer
        opened={opened}
        onClose={close}
        position="right"
        size="md"
        title={title ?? triggerLabel}
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
        transitionProps={{
          transition: "slide-left",
          duration: 260,
          timingFunction: "ease-out",
        }}
      >
        <Stack gap="xl">
          {children}
          {guideHref && (
            <Anchor href={guideHref} size="sm" fw={600}>
              Read the full guide <ArrowRight size={12} />
            </Anchor>
          )}
        </Stack>
      </Drawer>
    </>
  );
}

"use client";

import {
  ActionIcon,
  Popover,
  PopoverDropdown,
  PopoverTarget,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { HelpCircle } from "lucide-react";
import { GLOSSARY, type GlossaryKey } from "@/lib/payout-policy";

type InfoTipProps = {
  /** Free-form explanation. Ignored when `term` resolves from the glossary. */
  label?: string;
  /** Glossary key from payout-policy.ts — renders the term + definition. */
  term?: GlossaryKey;
  size?: number;
};

/**
 * Inline "what does this mean?" affordance: a small help icon that explains
 * itself in a popover on hover and on tap (tooltips are invisible on touch).
 * Place next to any number, label, or term that isn't self-explanatory:
 *
 *   <InfoTip term="weeklyCredit" />
 *   <InfoTip label="Estimated from your active tasks; not yet earned." />
 */
export default function InfoTip({ label, term, size = 14 }: InfoTipProps) {
  const [opened, { open, close, toggle }] = useDisclosure(false);
  const entry = term ? GLOSSARY[term] : undefined;
  const title = entry?.term;
  const body = entry?.definition ?? label;

  if (!body) return null;

  return (
    <Popover
      opened={opened}
      onDismiss={close}
      position="top"
      withArrow
      shadow="md"
      width={280}
    >
      <PopoverTarget>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="xs"
          onMouseEnter={open}
          onMouseLeave={close}
          onClick={toggle}
          aria-label={title ? `${title}: ${body}` : body}
          style={{ cursor: "help" }}
        >
          <HelpCircle size={size} />
        </ActionIcon>
      </PopoverTarget>
      <PopoverDropdown style={{ pointerEvents: "none" }}>
        <Stack gap={4}>
          {title && (
            <Text size="xs" fw={700}>
              {title}
            </Text>
          )}
          <Text size="xs">{body}</Text>
        </Stack>
      </PopoverDropdown>
    </Popover>
  );
}

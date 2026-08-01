"use client";

import {
  Badge,
  type BadgeProps,
  Popover,
  PopoverDropdown,
  PopoverTarget,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { StatusCopy } from "@/lib/status-copy";

type StatusBadgeProps = Omit<BadgeProps, "color" | "children"> & {
  /** Resolved at the call site: `statusCopy(TRANSACTION_STATUS, tx.status)`. */
  copy: StatusCopy;
  /** Extra call-site context shown below the standard status description. */
  hint?: string;
  /** Set false to render a plain badge with no explanation popover. */
  withHint?: boolean;
};

/**
 * Canonical status badge. Pair with the maps in src/lib/status-copy.ts:
 *
 *   <StatusBadge copy={statusCopy(WELCOME_PACK_ORDER_STATUS, order.status)} />
 *
 * When the status copy carries a description (or a `hint` is passed), the
 * badge explains itself in a popover that opens on hover and on tap — plain
 * tooltips are invisible on touch devices, and every status in the app should
 * answer "why?" without a support question.
 */
export default function StatusBadge({
  copy,
  hint,
  withHint = true,
  ...rest
}: StatusBadgeProps) {
  const [opened, { open, close, toggle }] = useDisclosure(false);
  const description = withHint ? copy.description : undefined;
  const extra = withHint ? hint : undefined;

  if (!description && !extra) {
    return (
      <Badge variant="light" {...rest} color={copy.color}>
        {copy.label}
      </Badge>
    );
  }

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
        <UnstyledButton
          onMouseEnter={open}
          onMouseLeave={close}
          onClick={toggle}
          aria-label={`${copy.label} — ${description ?? extra}`}
          style={{ cursor: "help", display: "inline-flex" }}
        >
          <Badge variant="light" {...rest} color={copy.color}>
            {copy.label}
          </Badge>
        </UnstyledButton>
      </PopoverTarget>
      <PopoverDropdown style={{ pointerEvents: "none" }}>
        <Stack gap={4}>
          {description && <Text size="xs">{description}</Text>}
          {extra && (
            <Text size="xs" c="dimmed">
              {extra}
            </Text>
          )}
        </Stack>
      </PopoverDropdown>
    </Popover>
  );
}

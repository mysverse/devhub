"use client";

import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * A section whose data failed to load, said out loud.
 *
 * Deliberately not an EmptyState: on the payout board the difference between
 * "no pending payouts" and "the pending payouts could not be loaded" is the
 * difference between an admin closing the tab and an admin paying someone.
 * Anything that degrades a money surface has to look like a fault, not like
 * good news — hence the red alert and the explicit "this is not empty" line.
 */
export default function SectionUnavailable({
  title = "This section couldn't be loaded",
  detail,
  emptyWarning = true,
}: {
  title?: string;
  /** Short cause, e.g. `P6000`. Shown so a log search has something to match. */
  detail?: string | null;
  /** Set false where an empty section carries no risk of being misread. */
  emptyWarning?: boolean;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  return (
    <Alert
      color="red"
      variant="light"
      icon={<TriangleAlert size={18} />}
      title={title}
    >
      <Stack gap="sm" align="flex-start">
        <Text fz="sm">
          The database did not answer in time
          {detail ? ` (${detail})` : ""}. This is a temporary fault, not a
          result
          {emptyWarning
            ? " — treat it as unknown, not as empty. Do not act on what is shown here."
            : "."}
        </Text>
        <Group gap="sm">
          <Button
            size="xs"
            color="red"
            variant="light"
            loading={refreshing}
            onClick={() => startRefresh(() => router.refresh())}
          >
            Try again
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}

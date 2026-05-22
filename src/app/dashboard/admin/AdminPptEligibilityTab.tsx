"use client";

import {
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Timeline,
  TimelineItem,
} from "@mantine/core";
import { ExternalLink, RotateCw } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SPRING } from "@/components/animations";
import { retryPptEligibilityAsAdmin } from "./ppt-eligibility-actions";

export type AdminPptEligibilityState = {
  id: string;
  linearIssueId: string;
  linearIssueIdentifier: string | null;
  linearIssueTitle: string | null;
  linearIssueUrl: string | null;
  developerName: string | null;
  assigneeEmail: string | null;
  status: string;
  reason: string | null;
  completionEpisode: number;
  proofCommentUrl: string | null;
  warningCount: number;
  updatedAt: string;
  events: {
    id: string;
    type: string;
    reason: string | null;
    message: string | null;
    createdAt: string;
  }[];
};

const statusColors: Record<string, string> = {
  BLOCKED: "red",
  NEEDS_PROOF: "yellow",
  WAITING_STABILITY: "blue",
  READY_FOR_PAYOUT: "green",
  TRANSACTION_PENDING: "green",
  ON_HOLD: "orange",
  PAID: "green",
  FLAGGED: "red",
};

function EligibilityCard({ state }: { state: AdminPptEligibilityState }) {
  const [retrying, setRetrying] = useState(false);
  const router = useRouter();
  const title = state.linearIssueIdentifier
    ? `${state.linearIssueIdentifier} - ${state.linearIssueTitle || "Untitled task"}`
    : state.linearIssueTitle || "Untitled PPT task";

  async function handleRetry() {
    setRetrying(true);
    const result = await retryPptEligibilityAsAdmin(state.linearIssueId);
    setRetrying(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("PPT eligibility rechecked");
    router.refresh();
  }

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={SPRING.snappy}
      style={{ height: "100%" }}
    >
      <Card withBorder radius="md" padding="lg" h="100%">
        <Stack gap="sm" h="100%">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Group gap="xs">
                <Badge
                  size="sm"
                  variant="light"
                  color={statusColors[state.status] ?? "gray"}
                >
                  {state.status.replaceAll("_", " ")}
                </Badge>
                {state.warningCount > 1 && (
                  <Badge size="sm" variant="light" color="orange">
                    {state.warningCount} warnings
                  </Badge>
                )}
              </Group>
              <Text fw={700} lineClamp={2}>
                {title}
              </Text>
            </Stack>
            {state.linearIssueUrl && (
              <Button
                component="a"
                href={state.linearIssueUrl}
                target="_blank"
                variant="subtle"
                size="xs"
                color="gray"
                leftSection={<ExternalLink size={12} />}
              >
                Linear
              </Button>
            )}
          </Group>

          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Developer:{" "}
              {state.developerName || state.assigneeEmail || "Unknown"}
            </Text>
            <Text size="sm" c="dimmed">
              Episode {state.completionEpisode} | Updated{" "}
              {new Date(state.updatedAt).toLocaleString()}
            </Text>
            {state.reason && (
              <Text size="sm" c={state.status === "FLAGGED" ? "red" : "dimmed"}>
                {state.reason.replaceAll("_", " ")}
              </Text>
            )}
          </Stack>

          {state.proofCommentUrl && (
            <Button
              component="a"
              href={state.proofCommentUrl}
              target="_blank"
              variant="light"
              size="xs"
              color="green"
            >
              Open proof comment
            </Button>
          )}

          {state.events.length > 0 && (
            <Timeline
              active={state.events.length}
              bulletSize={10}
              lineWidth={1}
            >
              {state.events.map((event) => (
                <TimelineItem
                  key={event.id}
                  title={event.type.replaceAll("_", " ")}
                >
                  <Text size="xs" c="dimmed">
                    {new Date(event.createdAt).toLocaleString()}
                    {event.reason
                      ? ` | ${event.reason.replaceAll("_", " ")}`
                      : ""}
                  </Text>
                  {event.message && (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {event.message}
                    </Text>
                  )}
                </TimelineItem>
              ))}
            </Timeline>
          )}

          <Button
            mt="auto"
            variant="light"
            color="blue"
            leftSection={<RotateCw size={14} />}
            loading={retrying}
            onClick={handleRetry}
          >
            Retry Eligibility
          </Button>
        </Stack>
      </Card>
    </motion.div>
  );
}

export default function AdminPptEligibilityTab({
  states,
}: {
  states: AdminPptEligibilityState[];
}) {
  if (states.length === 0) {
    return (
      <Card withBorder radius="md" padding="xl" ta="center">
        <Text c="dimmed">No PPT eligibility events yet.</Text>
      </Card>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      {states.map((state) => (
        <EligibilityCard key={state.id} state={state} />
      ))}
    </SimpleGrid>
  );
}

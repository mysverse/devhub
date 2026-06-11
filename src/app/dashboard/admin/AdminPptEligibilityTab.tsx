"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Timeline,
  TimelineItem,
} from "@mantine/core";
import { ExternalLink, RotateCw, ShieldCheck, X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import {
  MODAL_TRANSITION,
  OVERLAY_PROPS,
  SPRING,
} from "@/components/animations";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { PPT_PAYOUT_STATUS, statusCopy } from "@/lib/status-copy";
import {
  clearPptProofOverrideAsAdmin,
  overridePptProofAsAdmin,
  retryPptEligibilityAsAdmin,
} from "./ppt-eligibility-actions";

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
  owner: "developer" | "admin" | "automatic";
  nextStep: string | null;
  completionEpisode: number;
  proofCommentUrl: string | null;
  proofOverride: boolean;
  proofOverrideNote: string | null;
  proofOverrideByName: string | null;
  transactionStatus: string | null;
  payoutStatus: string | null;
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

const ownerLabels = {
  admin: { label: "Needs admin", color: "red" },
  developer: { label: "Waiting on developer", color: "yellow" },
  automatic: { label: "Automatic", color: "blue" },
};

const proofOverrideReasons = new Set([
  "MISSING_PROOF",
  "PROOF_RESET_BY_QUESTION",
  "REOPENED_BEFORE_PAYOUT",
  "ASSIGNEE_CHANGED_AFTER_PAYOUT_CHECK",
]);

const activeOrCompletedPayoutStatuses = new Set([
  "PENDING",
  "PROCESSING",
  "COMPLETED",
]);

function EligibilityCard({ state }: { state: AdminPptEligibilityState }) {
  const [retrying, setRetrying] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const title = state.linearIssueIdentifier
    ? `${state.linearIssueIdentifier} - ${state.linearIssueTitle || "Untitled task"}`
    : state.linearIssueTitle || "Untitled PPT task";
  const owner = ownerLabels[state.owner];
  const canOverrideProof =
    !state.proofOverride &&
    ["NEEDS_PROOF", "BLOCKED"].includes(state.status) &&
    proofOverrideReasons.has(state.reason ?? "") &&
    state.transactionStatus !== "PAID" &&
    !activeOrCompletedPayoutStatuses.has(state.payoutStatus ?? "");

  async function handleRetry() {
    setRetrying(true);
    const result = await retryPptEligibilityAsAdmin(state.linearIssueId);
    setRetrying(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("PPT eligibility rechecked");
  }

  async function handleOverride() {
    const note = overrideNote.trim();
    if (!note) {
      toast.error("Add a justification before overriding proof");
      return;
    }

    setOverriding(true);
    const result = await overridePptProofAsAdmin(state.linearIssueId, note);
    setOverriding(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("PPT proof override applied");
    setOverrideOpen(false);
    setOverrideNote("");
  }

  async function handleClearOverride() {
    setClearing(true);
    const result = await clearPptProofOverrideAsAdmin(state.linearIssueId);
    setClearing(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("PPT proof override cleared");
  }

  return (
    <>
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
                  <StatusBadge
                    size="sm"
                    copy={statusCopy(PPT_PAYOUT_STATUS, state.status)}
                  />
                  <Badge size="sm" variant="light" color={owner.color}>
                    {owner.label}
                  </Badge>
                  {state.warningCount > 1 && (
                    <Badge size="sm" variant="light" color="orange">
                      {state.warningCount} warnings
                    </Badge>
                  )}
                  {state.proofOverride && (
                    <Badge size="sm" variant="light" color="violet">
                      Overridden
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
                <Text
                  size="sm"
                  c={state.status === "FLAGGED" ? "red" : "dimmed"}
                >
                  {state.reason.replaceAll("_", " ")}
                </Text>
              )}
            </Stack>

            {state.nextStep && (
              <Alert variant="light" color={owner.color} p="sm">
                <Text size="sm" fw={600}>
                  Next step
                </Text>
                <Text size="sm">{state.nextStep}</Text>
              </Alert>
            )}

            {state.proofOverride && (
              <Alert variant="light" color="violet" p="sm">
                <Text size="sm" fw={600}>
                  Proof override
                </Text>
                {state.proofOverrideNote && (
                  <Text size="sm">{state.proofOverrideNote}</Text>
                )}
                {state.proofOverrideByName && (
                  <Text size="xs" c="dimmed" mt={4}>
                    Applied by {state.proofOverrideByName}
                  </Text>
                )}
                <Button
                  variant="light"
                  color="violet"
                  size="xs"
                  mt="sm"
                  leftSection={<X size={14} />}
                  loading={clearing}
                  onClick={handleClearOverride}
                >
                  Clear override
                </Button>
              </Alert>
            )}

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

            <Group mt="auto" gap="xs">
              {canOverrideProof && (
                <Button
                  variant="light"
                  color="violet"
                  leftSection={<ShieldCheck size={14} />}
                  onClick={() => setOverrideOpen(true)}
                >
                  Approve / Override proof
                </Button>
              )}
              <Button
                variant="light"
                color="blue"
                leftSection={<RotateCw size={14} />}
                loading={retrying}
                onClick={handleRetry}
              >
                Retry Eligibility
              </Button>
            </Group>
          </Stack>
        </Card>
      </motion.div>

      <Modal
        opened={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        title="Approve PPT without assignee proof"
        centered
        transitionProps={MODAL_TRANSITION}
        overlayProps={OVERLAY_PROPS}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {title}
          </Text>
          <Textarea
            label="Justification"
            placeholder="Why is this PPT payable without #ppt-proof from the assignee?"
            minRows={4}
            value={overrideNote}
            onChange={(event) => setOverrideNote(event.currentTarget.value)}
            required
          />
          <Group justify="flex-end">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => setOverrideOpen(false)}
            >
              Cancel
            </Button>
            <Button
              color="violet"
              leftSection={<ShieldCheck size={14} />}
              loading={overriding}
              onClick={handleOverride}
            >
              Apply override
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export default function AdminPptEligibilityTab({
  states,
}: {
  states: AdminPptEligibilityState[];
}) {
  if (states.length === 0) {
    return <EmptyState description="No PPT eligibility events yet." />;
  }

  const sections = [
    {
      owner: "admin",
      title: "Needs admin action",
      states: states.filter((state) => state.owner === "admin"),
    },
    {
      owner: "developer",
      title: "Waiting on developer",
      states: states.filter((state) => state.owner === "developer"),
    },
    {
      owner: "automatic",
      title: "Automatic",
      states: states.filter((state) => state.owner === "automatic"),
    },
  ].filter((section) => section.states.length > 0);

  return (
    <Stack gap="xl">
      {sections.map((section) => (
        <Stack key={section.owner} gap="sm">
          <Group gap="xs">
            <Text fw={700}>{section.title}</Text>
            <Badge variant="light">{section.states.length}</Badge>
          </Group>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            {section.states.map((state) => (
              <EligibilityCard key={state.id} state={state} />
            ))}
          </SimpleGrid>
        </Stack>
      ))}
    </Stack>
  );
}

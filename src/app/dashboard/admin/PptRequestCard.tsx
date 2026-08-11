"use client";

import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Check, X } from "lucide-react";
import { motion } from "motion/react";
import { memo, useRef, useState } from "react";
import { toast } from "sonner";
import AiAssistField from "@/components/ai-assist/AiAssistField";
import { SPRING } from "@/components/animations";
import CampaignBadge from "@/components/CampaignBadge";
import ConfirmModal from "@/components/ConfirmModal";
import type { CampaignBadgeInfo } from "@/lib/payout-campaign";
import { projectPptPayout } from "@/lib/ppt-payout-presentation";
import { approvePptRequest, rejectPptRequest } from "./ppt-request-actions";

export type PptRequestData = {
  id: string;
  requesterName: string;
  requesterEmail: string | null;
  requesterLinearId: string | null;
  linearIssueId: string | null;
  linearIssueIdentifier: string | null;
  linearIssueTitle: string;
  linearIssueUrl: string | null;
  linearTeamId: string;
  linearProjectId: string | null;
  linearProjectName: string | null;
  requestedEstimate: number;
  projectedDueDate: string;
  description: string | null;
  note: string | null;
  assigneeIntent: "SELF" | "TEAM_MEMBER" | "OPEN";
  intendedAssigneeLinearId: string | null;
  intendedAssigneeName: string | null;
  intendedAssigneeEmail: string | null;
  attachments: {
    id: string;
    filename: string;
    mimeType: string;
    byteSize: number;
    width: number | null;
    height: number | null;
  }[];
  createdAt: string;
  /**
   * Campaign the REQUESTER would be paid under, so an admin approving this
   * sees the same number the developer was quoted. Null when none applies —
   * including when a live campaign is label-restricted, since the issue does
   * not exist yet and its labels are unknown.
   */
  campaign: CampaignBadgeInfo | null;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function PptRequestCard({ request }: { request: PptRequestData }) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [
    rejectModalOpened,
    { open: openRejectModal, close: closeRejectModal },
  ] = useDisclosure(false);
  const [rejectReason, setRejectReason] = useState("");
  const rejectRef = useRef<HTMLTextAreaElement>(null);
  const [assignRequester, setAssignRequester] = useState(true);

  const estimatedMYR = projectPptPayout(
    request.requestedEstimate,
    "MYR",
    request.campaign,
  ).finalLabel;
  const estimatedRobux = projectPptPayout(
    request.requestedEstimate,
    "ROBUX",
    request.campaign,
  ).finalLabel;

  async function handleApprove() {
    setApproving(true);
    const result = await approvePptRequest(request.id, {
      assigneeTarget: assignRequester
        ? { type: "requester" }
        : { type: "open" },
    });
    setApproving(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("PPT request approved");
      if ("warning" in result && result.warning) {
        toast.warning(result.warning, { duration: 10_000 });
      }
    }
  }

  async function handleReject() {
    setRejecting(true);
    const result = await rejectPptRequest(
      request.id,
      rejectReason.trim() || undefined,
    );
    setRejecting(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("PPT request rejected");
      closeRejectModal();
      setRejectReason("");
    }
  }

  return (
    <>
      <motion.div
        whileHover={{ y: -3 }}
        transition={SPRING.snappy}
        style={{ height: "100%" }}
      >
        <Card withBorder radius="md" padding="lg" h="100%">
          <Stack gap="sm" justify="space-between" h="100%">
            <Stack gap="sm">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs">
                  {request.linearIssueId ? (
                    <Badge
                      size="sm"
                      variant="light"
                      color="gray"
                      component="a"
                      href={request.linearIssueUrl ?? "#"}
                      target="_blank"
                      style={{ cursor: "pointer" }}
                    >
                      {request.linearIssueIdentifier}
                    </Badge>
                  ) : (
                    <Badge size="sm" variant="light" color="blue">
                      New Issue
                    </Badge>
                  )}
                </Group>
                <Text fz="xs" c="dimmed">
                  {timeAgo(request.createdAt)}
                </Text>
              </Group>

              <Text fz="md" fw={600} lineClamp={2}>
                {request.linearIssueTitle}
              </Text>

              <Group gap="xs">
                <Text fz="sm" c="dimmed">
                  By
                </Text>
                <Text fz="sm" fw={500}>
                  {request.requesterName}
                </Text>
              </Group>

              <Group gap="md">
                <Box>
                  <Text fz="xs" c="dimmed" tt="uppercase" fw={600}>
                    Complexity
                  </Text>
                  <Group gap={4}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Box
                        key={n}
                        w={8}
                        h={8}
                        style={{
                          borderRadius: "50%",
                          backgroundColor:
                            n <= request.requestedEstimate
                              ? "var(--mantine-color-blue-6)"
                              : "var(--mantine-color-dark-4)",
                        }}
                      />
                    ))}
                  </Group>
                </Box>
                <Box>
                  <Group gap={6} wrap="nowrap">
                    <Text fz="xs" c="dimmed" tt="uppercase" fw={600}>
                      Amount
                    </Text>
                    {request.campaign && (
                      <CampaignBadge campaign={request.campaign} />
                    )}
                  </Group>
                  <Text
                    fz="sm"
                    fw={600}
                    c={
                      request.campaign ? request.campaign.accentColor : "green"
                    }
                  >
                    {estimatedMYR}
                  </Text>
                  <Text fz="xs" c="dimmed">
                    / {estimatedRobux}
                  </Text>
                </Box>
                <Box>
                  <Text fz="xs" c="dimmed" tt="uppercase" fw={600}>
                    Due
                  </Text>
                  <Text fz="sm">
                    {new Date(request.projectedDueDate).toLocaleDateString(
                      "en-MY",
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  </Text>
                </Box>
              </Group>

              {request.note && (
                <Box
                  p="xs"
                  style={{
                    backgroundColor: "var(--mantine-color-dark-6)",
                    borderRadius: "var(--mantine-radius-sm)",
                    borderLeft: "3px solid var(--mantine-color-dark-3)",
                  }}
                >
                  <Text fz="xs" c="dimmed" tt="uppercase" fw={600} mb={2}>
                    Note
                  </Text>
                  <Text fz="sm" c="dimmed">
                    {request.note}
                  </Text>
                </Box>
              )}

              {request.description && (
                <Box
                  p="xs"
                  style={{
                    backgroundColor: "var(--mantine-color-dark-6)",
                    borderRadius: "var(--mantine-radius-sm)",
                    borderLeft: "3px solid var(--mantine-color-blue-8)",
                  }}
                >
                  <Text fz="xs" c="dimmed" tt="uppercase" fw={600} mb={2}>
                    Description
                  </Text>
                  <Text fz="sm" c="dimmed" lineClamp={3}>
                    {request.description}
                  </Text>
                </Box>
              )}
            </Stack>

            <Stack gap="sm" mt="md">
              {request.requesterLinearId && (
                <Checkbox
                  label="Assign requester to issue"
                  checked={assignRequester}
                  onChange={(e) => setAssignRequester(e.currentTarget.checked)}
                  size="sm"
                />
              )}
              <Group gap="sm">
                <Button
                  color="green"
                  onClick={handleApprove}
                  loading={approving}
                  leftSection={<Check size={14} />}
                  style={{ flex: 1 }}
                >
                  Approve
                </Button>
                <Button
                  color="red"
                  variant="light"
                  onClick={openRejectModal}
                  disabled={approving}
                  leftSection={<X size={14} />}
                  style={{ flex: 1 }}
                >
                  Reject
                </Button>
              </Group>
            </Stack>
          </Stack>
        </Card>
      </motion.div>

      <ConfirmModal
        opened={rejectModalOpened}
        onClose={closeRejectModal}
        onConfirm={handleReject}
        title="Reject PPT request?"
        description={
          <>
            Reject the PPT request from <strong>{request.requesterName}</strong>
            . They&apos;ll be notified and can submit again later.
          </>
        }
        extra={
          <>
            <Textarea
              ref={rejectRef}
              label="Reason (optional)"
              placeholder="Why this request can't be approved right now"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.currentTarget.value)}
              autosize
              minRows={2}
              maxRows={4}
            />
            <AiAssistField
              fieldId="ppt_request_reject_reason"
              value={rejectReason}
              onChange={setRejectReason}
              textareaRef={rejectRef}
              disabled={rejecting}
            />
          </>
        }
        confirmLabel="Reject request"
        confirmIcon={<X size={14} />}
        loading={rejecting}
      />
    </>
  );
}

export default memo(PptRequestCard);

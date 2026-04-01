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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { estimateToAmount, formatAmount } from "@/lib/currency";
import { approvePptRequest, rejectPptRequest } from "./ppt-request-actions";

export type PptRequestData = {
  id: string;
  requesterName: string;
  requesterLinearId: string | null;
  linearIssueId: string | null;
  linearIssueIdentifier: string | null;
  linearIssueTitle: string;
  linearIssueUrl: string | null;
  linearTeamId: string;
  requestedEstimate: number;
  projectedDueDate: string;
  description: string | null;
  note: string | null;
  createdAt: string;
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

export default function PptRequestCard({
  request,
}: {
  request: PptRequestData;
}) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [assignRequester, setAssignRequester] = useState(true);

  const estimatedMYR = formatAmount(
    estimateToAmount(request.requestedEstimate, "MYR"),
    "MYR",
  );
  const estimatedRobux = formatAmount(
    estimateToAmount(request.requestedEstimate, "ROBUX"),
    "ROBUX",
  );

  async function handleApprove() {
    setApproving(true);
    const result = await approvePptRequest(request.id, { assignRequester });
    setApproving(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("PPT request approved");
      router.refresh();
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
      router.refresh();
    }
  }

  return (
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
              <Text fz="xs" c="dimmed" tt="uppercase" fw={600}>
                Amount
              </Text>
              <Text fz="sm" fw={600} c="green">
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
          {showRejectForm ? (
            <Stack gap="xs">
              <Textarea
                placeholder="Reason for rejection (optional)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.currentTarget.value)}
                autosize
                minRows={2}
                maxRows={3}
              />
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => setShowRejectForm(false)}
                  disabled={rejecting}
                >
                  Cancel
                </Button>
                <Button
                  size="xs"
                  color="red"
                  onClick={handleReject}
                  loading={rejecting}
                >
                  Confirm Reject
                </Button>
              </Group>
            </Stack>
          ) : (
            <>
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
                  style={{ flex: 1 }}
                >
                  Approve
                </Button>
                <Button
                  color="red"
                  variant="light"
                  onClick={() => setShowRejectForm(true)}
                  disabled={approving}
                  style={{ flex: 1 }}
                >
                  Reject
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}

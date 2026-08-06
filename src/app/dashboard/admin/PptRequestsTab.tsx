"use client";

import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Image,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Check, ExternalLink, FileText, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import CampaignBadge from "@/components/CampaignBadge";
import ConfirmModal from "@/components/ConfirmModal";
import EmptyState from "@/components/EmptyState";
import { estimateToAmount, formatAmount } from "@/lib/currency";
import { applyMultiplier } from "@/lib/payout-campaign";
import type { PptRequestData } from "./PptRequestCard";
import classes from "./PptRequestsTab.module.css";
import { approvePptRequest, rejectPptRequest } from "./ppt-request-actions";

type AssigneeChoice = "requester" | "suggested" | "open" | "keep_existing";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function defaultAssigneeChoice(request: PptRequestData): AssigneeChoice {
  if (request.assigneeIntent === "OPEN") return "open";
  if (
    request.assigneeIntent === "TEAM_MEMBER" &&
    request.intendedAssigneeLinearId
  ) {
    return "suggested";
  }
  if (request.requesterLinearId) return "requester";
  return request.linearIssueId ? "keep_existing" : "open";
}

function AttachmentPreview({
  attachment,
}: {
  attachment: PptRequestData["attachments"][number];
}) {
  const href = `/api/ppt-requests/attachments/${attachment.id}`;
  if (attachment.mimeType.startsWith("image/")) {
    return (
      <Box
        style={{
          border: "1px solid var(--mantine-color-default-border)",
          borderRadius: "var(--mantine-radius-sm)",
          overflow: "hidden",
        }}
      >
        <Image src={href} alt={attachment.filename} h={180} fit="cover" />
        <Group justify="space-between" p="xs" wrap="nowrap">
          <Text size="xs" fw={600} truncate="end">
            {attachment.filename}
          </Text>
          <Text size="xs" c="dimmed">
            {fileSize(attachment.byteSize)}
          </Text>
        </Group>
      </Box>
    );
  }

  return (
    <Group
      justify="space-between"
      p="sm"
      style={{
        border: "1px solid var(--mantine-color-default-border)",
        borderRadius: "var(--mantine-radius-sm)",
      }}
      wrap="nowrap"
    >
      <Group gap="xs" style={{ minWidth: 0 }} wrap="nowrap">
        <FileText size={18} color="var(--mantine-color-blue-4)" />
        <Box style={{ minWidth: 0 }}>
          <Anchor href={href} target="_blank" fw={700} size="sm">
            {attachment.filename}
          </Anchor>
          <Text size="xs" c="dimmed">
            PDF · {fileSize(attachment.byteSize)}
          </Text>
        </Box>
      </Group>
      <ExternalLink size={14} color="var(--mantine-color-dimmed)" />
    </Group>
  );
}

export default function PptRequestsTab({
  requests,
}: {
  requests: PptRequestData[];
}) {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("request");
  const [selectedId, setSelectedId] = useState(
    requests.some((request) => request.id === requestedId)
      ? requestedId
      : (requests[0]?.id ?? null),
  );
  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? requests[0],
    [requests, selectedId],
  );
  const [assigneeChoices, setAssigneeChoices] = useState<
    Record<string, AssigneeChoice>
  >({});
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [
    rejectModalOpened,
    { open: openRejectModal, close: closeRejectModal },
  ] = useDisclosure(false);

  if (requests.length === 0 || !selected) {
    return <EmptyState description="No pending PPT requests." />;
  }

  const assigneeChoice =
    assigneeChoices[selected.id] ?? defaultAssigneeChoice(selected);
  const selectedMultiplier = selected.campaign?.multiplier ?? 1;
  const estimatedMYR = formatAmount(
    applyMultiplier(
      estimateToAmount(selected.requestedEstimate, "MYR"),
      selectedMultiplier,
      "MYR",
    ),
    "MYR",
  );
  const estimatedRobux = formatAmount(
    applyMultiplier(
      estimateToAmount(selected.requestedEstimate, "ROBUX"),
      selectedMultiplier,
      "ROBUX",
    ),
    "ROBUX",
  );

  async function handleApprove() {
    if (!selected) return;
    setApproving(true);
    const result = await approvePptRequest(selected.id, {
      assigneeTarget:
        assigneeChoice === "requester"
          ? { type: "requester" }
          : assigneeChoice === "suggested" && selected.intendedAssigneeLinearId
            ? {
                type: "linear_user",
                linearId: selected.intendedAssigneeLinearId,
                name: selected.intendedAssigneeName,
              }
            : assigneeChoice === "keep_existing"
              ? { type: "keep_existing" }
              : { type: "open" },
    });
    setApproving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("PPT request approved");
    if ("warning" in result && result.warning) {
      toast.warning(result.warning, { duration: 10_000 });
    }
  }

  async function handleReject() {
    if (!selected) return;
    setRejecting(true);
    const result = await rejectPptRequest(
      selected.id,
      rejectReason.trim() || undefined,
    );
    setRejecting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("PPT request rejected");
    closeRejectModal();
    setRejectReason("");
  }

  const choiceData = [
    ...(selected.requesterLinearId
      ? [{ value: "requester", label: "Requester" }]
      : []),
    ...(selected.intendedAssigneeLinearId
      ? [{ value: "suggested", label: "Suggested" }]
      : []),
    { value: "open", label: "Open" },
    ...(selected.linearIssueId
      ? [{ value: "keep_existing", label: "Keep existing" }]
      : []),
  ];

  return (
    <>
      <StaggerContainer>
        <Box className={classes.requestGrid}>
          <StaggerItem>
            <Card withBorder radius="md" padding="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={3}>PPT Requests</Title>
                  <Badge>{requests.length}</Badge>
                </Group>
                <Stack gap="xs">
                  {requests.map((request) => {
                    const active = request.id === selected.id;
                    return (
                      <Box
                        key={request.id}
                        component="button"
                        type="button"
                        onClick={() => setSelectedId(request.id)}
                        p="sm"
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border:
                            "1px solid var(--mantine-color-default-border)",
                          borderRadius: "var(--mantine-radius-sm)",
                          background: active
                            ? "rgba(34, 139, 230, 0.12)"
                            : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <Group justify="space-between" mb={6} wrap="nowrap">
                          <Badge
                            size="xs"
                            color={request.linearIssueId ? "gray" : "blue"}
                          >
                            {request.linearIssueIdentifier ?? "New issue"}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            {timeAgo(request.createdAt)}
                          </Text>
                        </Group>
                        <Text size="sm" fw={700} lineClamp={2}>
                          {request.linearIssueTitle}
                        </Text>
                        <Group gap="xs" mt={6}>
                          <Badge size="xs" variant="light">
                            {request.requestedEstimate} pts
                          </Badge>
                          {request.attachments.length > 0 && (
                            <Badge size="xs" variant="light" color="indigo">
                              {request.attachments.length} file
                              {request.attachments.length === 1 ? "" : "s"}
                            </Badge>
                          )}
                        </Group>
                      </Box>
                    );
                  })}
                </Stack>
              </Stack>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Card withBorder radius="md" padding="lg">
              <Stack gap="lg">
                <Group justify="space-between" align="flex-start" wrap="wrap">
                  <Box style={{ minWidth: 0 }}>
                    <Group gap="xs" mb="xs">
                      <Badge color={selected.linearIssueId ? "gray" : "blue"}>
                        {selected.linearIssueIdentifier ?? "New issue"}
                      </Badge>
                      {selected.linearProjectName && (
                        <Badge variant="dot" color="gray">
                          {selected.linearProjectName}
                        </Badge>
                      )}
                      <Badge variant="light">
                        {selected.assigneeIntent === "SELF"
                          ? "Creator wants self"
                          : selected.assigneeIntent === "TEAM_MEMBER"
                            ? "Creator suggested teammate"
                            : "Creator wants open"}
                      </Badge>
                    </Group>
                    <Title order={2}>{selected.linearIssueTitle}</Title>
                    <Text size="sm" c="dimmed" mt={4}>
                      By {selected.requesterName}
                      {selected.requesterEmail
                        ? ` · ${selected.requesterEmail}`
                        : ""}
                    </Text>
                  </Box>
                  {selected.linearIssueUrl && (
                    <Button
                      component="a"
                      href={selected.linearIssueUrl}
                      target="_blank"
                      variant="light"
                      rightSection={<ExternalLink size={14} />}
                    >
                      Linear
                    </Button>
                  )}
                </Group>

                <Group gap="xl">
                  <Box>
                    <Group gap={6} wrap="nowrap">
                      <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                        Amount
                      </Text>
                      {selected.campaign && (
                        <CampaignBadge campaign={selected.campaign} />
                      )}
                    </Group>
                    <Text
                      fw={800}
                      c={
                        selected.campaign
                          ? selected.campaign.accentColor
                          : "green"
                      }
                    >
                      {estimatedMYR}
                    </Text>
                    <Text size="xs" c="dimmed">
                      / {estimatedRobux}
                    </Text>
                  </Box>
                  <Box>
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      Due
                    </Text>
                    <Text fw={700}>
                      {formatDate(selected.projectedDueDate)}
                    </Text>
                  </Box>
                  <Box>
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      Complexity
                    </Text>
                    <Text fw={700}>{selected.requestedEstimate} points</Text>
                  </Box>
                </Group>

                <Divider />

                <Box>
                  <Text size="sm" fw={800} mb="xs">
                    Description
                  </Text>
                  {selected.description ? (
                    <Box
                      style={{
                        color: "var(--mantine-color-text)",
                        lineHeight: 1.6,
                      }}
                    >
                      <Markdown remarkPlugins={[remarkGfm]}>
                        {selected.description}
                      </Markdown>
                    </Box>
                  ) : (
                    <Text size="sm" c="dimmed">
                      No description provided.
                    </Text>
                  )}
                </Box>

                {selected.note && (
                  <Box
                    p="md"
                    style={{
                      borderLeft: "3px solid var(--mantine-color-blue-6)",
                      background: "var(--mantine-color-dark-6)",
                      borderRadius: "var(--mantine-radius-sm)",
                    }}
                  >
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700} mb={4}>
                      Admin note
                    </Text>
                    <Text size="sm">{selected.note}</Text>
                  </Box>
                )}

                {selected.attachments.length > 0 && (
                  <Box>
                    <Text size="sm" fw={800} mb="xs">
                      Attachments
                    </Text>
                    <Box
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "var(--mantine-spacing-sm)",
                      }}
                    >
                      {selected.attachments.map((attachment) => (
                        <AttachmentPreview
                          key={attachment.id}
                          attachment={attachment}
                        />
                      ))}
                    </Box>
                  </Box>
                )}

                <Divider />

                <Stack gap="sm">
                  <Text size="sm" fw={800}>
                    Assignment decision
                  </Text>
                  {selected.intendedAssigneeName && (
                    <Text size="sm" c="dimmed">
                      Suggested teammate: {selected.intendedAssigneeName}
                      {selected.intendedAssigneeEmail
                        ? ` · ${selected.intendedAssigneeEmail}`
                        : ""}
                    </Text>
                  )}
                  <SegmentedControl
                    value={assigneeChoice}
                    onChange={(value) =>
                      setAssigneeChoices((current) => ({
                        ...current,
                        [selected.id]: value as AssigneeChoice,
                      }))
                    }
                    data={choiceData}
                    fullWidth
                  />
                </Stack>

                <Group justify="flex-end">
                  <Button
                    color="red"
                    variant="light"
                    onClick={openRejectModal}
                    leftSection={<X size={14} />}
                  >
                    Reject
                  </Button>
                  <Button
                    color="green"
                    onClick={handleApprove}
                    loading={approving}
                    leftSection={<Check size={14} />}
                  >
                    Approve
                  </Button>
                </Group>
              </Stack>
            </Card>
          </StaggerItem>
        </Box>
      </StaggerContainer>

      <ConfirmModal
        opened={rejectModalOpened}
        onClose={closeRejectModal}
        onConfirm={handleReject}
        title="Reject PPT request?"
        description={
          <Text component="span" size="sm">
            Reject the PPT request from{" "}
            <strong>{selected.requesterName}</strong>. They&apos;ll be notified
            and can submit again later.
          </Text>
        }
        extra={
          <Textarea
            label="Reason"
            placeholder="Why this request can't be approved right now"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.currentTarget.value)}
            autosize
            minRows={2}
            maxRows={4}
          />
        }
        confirmLabel="Reject request"
        confirmIcon={<X size={14} />}
        loading={rejecting}
      />
    </>
  );
}

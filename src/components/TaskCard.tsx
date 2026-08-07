"use client";

import {
  Anchor,
  Avatar,
  Badge,
  Card,
  CardSection,
  Group,
  Image,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { motion } from "motion/react";
import { memo, useState } from "react";
import Markdown from "react-markdown";
import { SPRING } from "@/components/animations";
import CampaignBadge, {
  type CampaignBadgeInfo,
} from "@/components/CampaignBadge";
import type { CurrencyCode } from "@/lib/currency";
import { projectPptPayout } from "@/lib/ppt-payout-presentation";
import { PPT_OWNER_COPY, type PptNextStepOwner } from "@/lib/ppt-reason-copy";
import {
  PPT_ASSIGNMENT_WATCH_STATUS,
  PPT_PAYOUT_STATUS,
  statusCopy,
} from "@/lib/status-copy";
import AssignmentCountdownBanner from "./AssignmentCountdownBanner";
import BlockedTaskButton from "./BlockedTaskButton";
import ClaimButton, { type ClaimButtonContext } from "./ClaimButton";
import PptProgressButton from "./PptProgressButton";
import PptProofButton from "./PptProofButton";
import ReleaseTaskButton from "./ReleaseTaskButton";
import StatusBadge from "./StatusBadge";

function extractFirstImage(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  const match = markdown.match(/!\[.*?\]\((https?:\/\/.*?)\)/);
  if (!match) return null;
  return `/api/image-proxy?url=${encodeURIComponent(match[1])}`;
}

function DescriptionContent({
  text,
  lines,
  size = "sm",
}: {
  text: string | null | undefined;
  lines: number;
  size?: "xs" | "sm";
}) {
  if (!text) {
    return (
      <Text fz={size} c="dimmed">
        No description provided.
      </Text>
    );
  }
  const cleaned = text.replace(/!\[.*?\]\(.*?\)/g, "").trim();
  return (
    <div
      style={{
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: lines,
        WebkitBoxOrient: "vertical",
        fontSize: `var(--mantine-font-size-${size})`,
        color: "var(--mantine-color-dimmed)",
        lineHeight: 1.55,
      }}
    >
      <Markdown
        components={{
          p: ({ children }) => <span>{children}</span>,
          a: ({ children }) => <span>{children}</span>,
          h1: ({ children }) => <span>{children}</span>,
          h2: ({ children }) => <span>{children}</span>,
          h3: ({ children }) => <span>{children}</span>,
          ul: ({ children }) => <span>{children}</span>,
          ol: ({ children }) => <span>{children}</span>,
          li: ({ children }) => <span>{children} </span>,
        }}
      >
        {cleaned}
      </Markdown>
    </div>
  );
}

type TaskCardProps = {
  issueId: string;
  identifier: string;
  title: string;
  url: string;
  estimate: number | null | undefined;
  description?: string | null;
  projectName?: string | null;
  assigneeName?: string | null;
  assigneeAvatarUrl?: string | null;
  isAssignedToViewer?: boolean;
  hideProject?: boolean;
  subIssueCount?: number;
  variant?: "full" | "compact" | "active";
  currency?: CurrencyCode;
  earningsText?: string | null;
  earningsColor?: string;
  isPpt?: boolean;
  proofStatus?: string | null;
  /** Plain-language reason from formatReason() — never a raw enum. */
  proofReason?: string | null;
  proofNextStep?: string | null;
  /** Who the next step is waiting on, from describePptNextStep(). */
  proofOwner?: PptNextStepOwner | null;
  assignmentWatch?: PptAssignmentWatchCardData | null;
  /** Workload + policy context for the pre-claim commitment modal. */
  claimContext?: ClaimButtonContext | null;
  /** Ambient "claimed Xd ago · last activity Yd ago" chip for assigned cards. */
  assignmentInfo?: TaskAssignmentInfo | null;
  /** Viewer recently held this now-unassigned task — show a reclaim hint. */
  recentlyReleasedByViewer?: boolean;
  /**
   * Live payout campaign covering THIS task. Resolved server-side (label
   * filters and all) and threaded down, so a card only shows the multiplier
   * when that specific task actually qualifies.
   */
  campaign?: CampaignBadgeInfo | null;
  /**
   * Why this task is being shown to this developer, from
   * rankTasksForDeveloper(). A ranked list with no stated reason reads as a
   * lottery, so recommendation surfaces always pass one.
   */
  recommendationReason?: string | null;
};

export type TaskAssignmentInfo = {
  label: string;
  tone: "gray" | "yellow" | "orange";
};

export type PptAssignmentWatchCardData = {
  status: string;
  lastActivityAt: string;
  warningAt: string;
  unassignAt: string;
  snoozedUntil: string | null;
  warningCount: number;
  isPaused: boolean;
  selfBlockReasonLabel: string | null;
  selfBlockExpiresAt: string | null;
  selfBlockHours: number;
  /** Server clock at render, so the countdown's first paint hydrates cleanly. */
  serverNow: string;
};

function ComplexityDots({ points }: { points: number | null | undefined }) {
  const count = points || 0;
  if (count === 0) return null;
  return (
    <Tooltip label={`Complexity: ${count} pts`}>
      <Group gap={3} align="center" style={{ cursor: "default" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static fixed-length dot indicators
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background:
                i < count
                  ? "var(--mantine-color-blue-5)"
                  : "var(--mantine-color-dark-4)",
            }}
          />
        ))}
      </Group>
    </Tooltip>
  );
}

function LinearIcon({ url }: { url: string }) {
  return (
    <Anchor
      href={url}
      target="_blank"
      style={{ display: "flex", opacity: 0.7 }}
    >
      <Image src="/linear.png" w={18} h={18} alt="Open in Linear" />
    </Anchor>
  );
}

function HoverLift({
  children,
  fixedWidth,
}: {
  children: React.ReactNode;
  fixedWidth?: number;
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={SPRING.snappy}
      style={{ height: "100%", width: fixedWidth }}
    >
      {children}
    </motion.div>
  );
}

function TaskPreviewImage({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <CardSection
      mb="md"
      style={{
        overflow: "hidden",
        height: 160,
        background: "var(--mantine-color-dark-7)",
      }}
    >
      <motion.div
        whileHover={{ scale: 1.04 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{ height: "100%" }}
      >
        <Image
          src={src}
          height={160}
          alt={title}
          onLoad={() => setLoaded(true)}
          style={{
            opacity: loaded ? 1 : 0,
            transition: "opacity var(--duration-fast) var(--ease-out)",
          }}
        />
      </motion.div>
    </CardSection>
  );
}

function formatWatchDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function AssignmentWatchPanel({
  issueId,
  identifier,
  watch,
}: {
  issueId: string;
  identifier: string;
  watch: PptAssignmentWatchCardData;
}) {
  const copy = statusCopy(PPT_ASSIGNMENT_WATCH_STATUS, watch.status);
  const isBlocked = watch.status === "BLOCKED";
  const pausedLabel = isBlocked
    ? `Timer paused — blocked${watch.selfBlockReasonLabel ? ` (${watch.selfBlockReasonLabel})` : ""}${
        watch.selfBlockExpiresAt
          ? `, auto-resumes ${formatWatchDate(watch.selfBlockExpiresAt)}`
          : ""
      }`
    : watch.snoozedUntil
      ? `Timer paused by an admin until ${formatWatchDate(watch.snoozedUntil)}`
      : null;

  return (
    <div
      style={{
        border: "1px solid var(--mantine-color-default-border)",
        borderRadius: "var(--mantine-radius-sm)",
        padding: "var(--mantine-spacing-sm)",
        background: "var(--mantine-color-dark-7)",
        marginBottom: "var(--mantine-spacing-sm)",
      }}
    >
      <Stack gap={8}>
        <Group justify="space-between" align="center">
          <StatusBadge copy={copy} size="sm" />
          <Group gap={4}>
            <PptProgressButton issueId={issueId} compact />
            <BlockedTaskButton
              issueId={issueId}
              isBlocked={isBlocked}
              selfBlockHours={watch.selfBlockHours}
              compact
            />
            <ReleaseTaskButton
              issueId={issueId}
              identifier={identifier}
              compact
            />
          </Group>
        </Group>
        <AssignmentCountdownBanner
          lastActivityAt={watch.lastActivityAt}
          warningAt={watch.warningAt}
          unassignAt={watch.unassignAt}
          serverNow={watch.serverNow}
          isPaused={watch.isPaused}
          pausedLabel={pausedLabel}
        />
        <Text size="xs" c="dimmed">
          Last activity {formatWatchDate(watch.lastActivityAt)} — progress
          notes, state changes, and edits all reset the timer.
        </Text>
        {watch.warningCount > 0 && (
          <Text size="xs" c="dimmed">
            {watch.warningCount} activity reminder
            {watch.warningCount === 1 ? "" : "s"} so far
          </Text>
        )}
      </Stack>
    </div>
  );
}

function TaskCard({
  issueId,
  identifier,
  title,
  url,
  estimate,
  description,
  projectName,
  assigneeName,
  assigneeAvatarUrl,
  isAssignedToViewer,
  hideProject,
  subIssueCount,
  variant = "full",
  currency = "MYR",
  earningsText,
  earningsColor = "green",
  isPpt,
  proofStatus,
  proofReason,
  proofNextStep,
  proofOwner,
  assignmentWatch,
  claimContext,
  assignmentInfo,
  recentlyReleasedByViewer,
  campaign,
  recommendationReason,
}: TaskCardProps) {
  // What this task actually pays right now. The engine re-derives it
  // server-side at payout time; every display uses the same projection helper.
  const payout = projectPptPayout(estimate, currency, campaign);
  const pptEstimate = payout.finalAmount ?? 0;
  const estimateLabel = estimate ? payout.finalLabel : null;
  const payoutLabel = payout.finalLabel;

  if (variant === "compact") {
    return (
      <HoverLift fixedWidth={300}>
        <Card
          withBorder
          radius="md"
          padding="lg"
          style={{
            width: 300,
            height: 200,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Group justify="space-between" mb="xs">
            <Badge size="sm" variant="light">
              {identifier}
            </Badge>
            <Group gap={6} wrap="nowrap">
              {campaign && <CampaignBadge campaign={campaign} />}
              <Text
                fw={700}
                c={campaign ? campaign.accentColor : "green"}
                data-testid="ppt-payout"
              >
                {payoutLabel}
              </Text>
            </Group>
          </Group>
          <Text fw={600} lineClamp={1} mb="sm">
            {title}
          </Text>
          <div style={{ flex: 1, marginBottom: "var(--mantine-spacing-sm)" }}>
            <DescriptionContent
              text={description}
              lines={recommendationReason ? 1 : 2}
              size="xs"
            />
          </div>
          {recommendationReason && (
            <Text fz="xs" c="dimmed" lineClamp={1} mb={6}>
              {recommendationReason}
            </Text>
          )}
          <Group justify="space-between" mt="auto" align="center">
            <LinearIcon url={url} />
            <ClaimButton
              issueId={issueId}
              claimContext={claimContext}
              estimateLabel={estimateLabel}
            />
          </Group>
        </Card>
      </HoverLift>
    );
  }

  if (variant === "active") {
    const proofCopy =
      proofStatus && proofStatus !== "PAID"
        ? statusCopy(PPT_PAYOUT_STATUS, proofStatus)
        : null;
    const ownerCopy = proofOwner ? PPT_OWNER_COPY[proofOwner] : null;

    return (
      <HoverLift>
        <Card withBorder radius="md" padding="lg" h="100%">
          <Group justify="space-between" align="flex-start" mb="xs">
            <Group gap="xs" align="center" wrap="wrap">
              <Badge variant="light" color="blue">
                {identifier}
              </Badge>
              {isPpt ? (
                <Badge variant="dot" color="violet" size="sm">
                  PPT Task
                </Badge>
              ) : earningsText ? (
                <Badge variant="dot" color="teal" size="sm">
                  Bonus Candidate
                </Badge>
              ) : null}
            </Group>
            {(earningsText || pptEstimate > 0) && (
              <Group gap={6} wrap="nowrap">
                {campaign && !earningsText && (
                  <CampaignBadge campaign={campaign} />
                )}
                <Text
                  fw={700}
                  c={earningsColor}
                  fz="sm"
                  data-testid="ppt-payout"
                >
                  {earningsText ?? `${payout.finalLabel} (Pending)`}
                </Text>
              </Group>
            )}
          </Group>
          <Text fw={600} lineClamp={1} mb="md">
            {title}
          </Text>
          {proofCopy && (
            <div style={{ marginBottom: "var(--mantine-spacing-sm)" }}>
              <Group gap={6}>
                <StatusBadge
                  copy={proofCopy}
                  hint={proofReason ?? undefined}
                  size="sm"
                />
                {ownerCopy && (
                  <Badge variant="outline" color={ownerCopy.color} size="sm">
                    {ownerCopy.label}
                  </Badge>
                )}
              </Group>
              {proofNextStep && (
                <Text size="xs" c="dimmed" mt={6} style={{ lineHeight: 1.45 }}>
                  {proofNextStep}
                </Text>
              )}
            </div>
          )}
          {assignmentWatch && (
            <AssignmentWatchPanel
              issueId={issueId}
              identifier={identifier}
              watch={assignmentWatch}
            />
          )}
          <Group justify="space-between" mt="auto">
            <Text fz="sm" c="dimmed">
              {estimate ? `${estimate} pts` : "Unestimated"}
            </Text>
            <Group gap="xs">
              {isPpt && <PptProofButton issueId={issueId} compact />}
              <LinearIcon url={url} />
            </Group>
          </Group>
        </Card>
      </HoverLift>
    );
  }

  // variant === "full"
  const imageUrl = extractFirstImage(description);

  return (
    <HoverLift>
      <Card
        withBorder
        radius="md"
        padding="lg"
        h="100%"
        style={{ display: "flex", flexDirection: "column" }}
      >
        {imageUrl && <TaskPreviewImage src={imageUrl} title={title} />}

        <Group justify="space-between" align="flex-start" mb="xs">
          <Group gap="xs" style={{ flexWrap: "wrap" }} align="center">
            <Badge variant="light" color="blue">
              {identifier}
            </Badge>
            {projectName && !hideProject && (
              <Badge variant="dot" color="gray" size="sm">
                {projectName}
              </Badge>
            )}
            {assigneeName && (
              <Tooltip label={assigneeName}>
                <Avatar
                  src={assigneeAvatarUrl}
                  size={22}
                  radius="xl"
                  color={isAssignedToViewer ? "green" : "gray"}
                >
                  {assigneeName.charAt(0).toUpperCase()}
                </Avatar>
              </Tooltip>
            )}
          </Group>
          <Group gap={6} wrap="nowrap">
            {campaign && <CampaignBadge campaign={campaign} />}
            <Text
              fw={700}
              c={campaign ? campaign.accentColor : "green"}
              fz="sm"
              data-testid="ppt-payout"
            >
              {payoutLabel}
            </Text>
          </Group>
        </Group>

        {(assignmentInfo || recentlyReleasedByViewer) && (
          <Group gap="xs" mb="xs">
            {assignmentInfo && (
              <Badge
                variant="light"
                color={assignmentInfo.tone}
                size="xs"
                style={{ textTransform: "none" }}
              >
                {assignmentInfo.label}
              </Badge>
            )}
            {recentlyReleasedByViewer && (
              <Badge
                variant="light"
                color="teal"
                size="xs"
                style={{ textTransform: "none" }}
              >
                You recently worked on this &mdash; reclaim?
              </Badge>
            )}
          </Group>
        )}

        <Title order={4} size="h5" lineClamp={2} mb="xs">
          {title}
        </Title>
        <div style={{ marginBottom: "var(--mantine-spacing-md)" }}>
          <DescriptionContent text={description} lines={3} />
        </div>

        <Group
          gap="sm"
          align="center"
          mt="auto"
          pt="md"
          style={{
            borderTop: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <ComplexityDots points={estimate} />
          {subIssueCount != null && subIssueCount > 0 && (
            <Tooltip
              label={`${subIssueCount} sub-issue${subIssueCount !== 1 ? "s" : ""}`}
            >
              <Badge variant="light" color="gray" size="xs">
                {subIssueCount} sub
              </Badge>
            </Tooltip>
          )}
          <Group gap="sm" align="center" ml="auto">
            <LinearIcon url={url} />
            {isAssignedToViewer ? (
              <Badge variant="light" color="green" size="sm">
                Yours
              </Badge>
            ) : (
              <ClaimButton
                issueId={issueId}
                assigneeName={assigneeName}
                claimContext={claimContext}
                estimateLabel={estimateLabel}
              />
            )}
          </Group>
        </Group>
      </Card>
    </HoverLift>
  );
}

export default memo(TaskCard);

"use client";

import {
  Anchor,
  Avatar,
  Badge,
  Card,
  CardSection,
  Group,
  Image,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { motion } from "motion/react";
import Markdown from "react-markdown";
import { SPRING } from "@/components/animations";
import type { CurrencyCode } from "@/lib/currency";
import { estimateToAmount, formatAmount, formatEstimate } from "@/lib/currency";
import ClaimButton from "./ClaimButton";

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

export default function TaskCard({
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
}: TaskCardProps) {
  const pptEstimate = estimate ? estimateToAmount(estimate, currency) : 0;

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
            <Text fw={700} c="green">
              {formatEstimate(estimate, currency)}
            </Text>
          </Group>
          <Text fw={600} lineClamp={1} mb="sm">
            {title}
          </Text>
          <div style={{ flex: 1, marginBottom: "var(--mantine-spacing-sm)" }}>
            <DescriptionContent text={description} lines={2} size="xs" />
          </div>
          <Group justify="space-between" mt="auto" align="center">
            <LinearIcon url={url} />
            <ClaimButton issueId={issueId} />
          </Group>
        </Card>
      </HoverLift>
    );
  }

  if (variant === "active") {
    return (
      <HoverLift>
        <Card withBorder radius="md" padding="lg" h="100%">
          <Group justify="space-between" align="flex-start" mb="xs">
            <Badge variant="light" color="blue">
              {identifier}
            </Badge>
            {(earningsText || pptEstimate > 0) && (
              <Text fw={700} c={earningsColor} fz="sm">
                {earningsText ??
                  `${formatAmount(pptEstimate, currency)} (Pending)`}
              </Text>
            )}
          </Group>
          <Text fw={600} lineClamp={1} mb="md">
            {title}
          </Text>
          <Group justify="space-between" mt="auto">
            <Text fz="sm" c="dimmed">
              {estimate ? `${estimate} pts` : "Unestimated"}
            </Text>
            <LinearIcon url={url} />
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
        {imageUrl && (
          <CardSection mb="md" style={{ overflow: "hidden" }}>
            <motion.div
              whileHover={{ scale: 1.04 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <Image src={imageUrl} height={160} alt={title} />
            </motion.div>
          </CardSection>
        )}

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
          <Text fw={700} c="green" fz="sm">
            {formatEstimate(estimate, currency)}
          </Text>
        </Group>

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
              <ClaimButton issueId={issueId} assigneeName={assigneeName} />
            )}
          </Group>
        </Group>
      </Card>
    </HoverLift>
  );
}

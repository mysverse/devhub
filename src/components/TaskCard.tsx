import {
  Anchor,
  Badge,
  Card,
  CardSection,
  Group,
  Image,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import Markdown from "react-markdown";
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
  isAssignedToViewer?: boolean;
  variant?: "full" | "compact" | "active";
};

export default function TaskCard({
  issueId,
  identifier,
  title,
  url,
  estimate,
  description,
  projectName,
  assigneeName,
  isAssignedToViewer,
  variant = "full",
}: TaskCardProps) {
  const pptEstimate = estimate ? estimate * 20 : 0;

  if (variant === "compact") {
    return (
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
            {pptEstimate > 0 ? `RM${pptEstimate}` : "RM20 - RM100"}
          </Text>
        </Group>
        <Text fw={600} lineClamp={1} mb="sm">
          {title}
        </Text>
        <div style={{ flex: 1, marginBottom: "var(--mantine-spacing-sm)" }}>
          <DescriptionContent text={description} lines={2} size="xs" />
        </div>
        <Group justify="space-between" mt="auto" align="center">
          <Anchor href={url} target="_blank" fz="xs" fw={500}>
            Linear &rarr;
          </Anchor>
          <ClaimButton issueId={issueId} />
        </Group>
      </Card>
    );
  }

  if (variant === "active") {
    return (
      <Card withBorder radius="md" padding="lg" h="100%">
        <Group justify="space-between" align="flex-start" mb="xs">
          <Badge variant="light" color="blue">
            {identifier}
          </Badge>
          {pptEstimate > 0 && (
            <Text fw={700} c="green" fz="sm">
              RM{pptEstimate.toFixed(2)} (Pending)
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
          <Anchor href={url} target="_blank" fz="sm" fw={500}>
            Open in Linear &rarr;
          </Anchor>
        </Group>
      </Card>
    );
  }

  // variant === "full"
  const imageUrl = extractFirstImage(description);

  return (
    <Card
      withBorder
      radius="md"
      padding="lg"
      h="100%"
      style={{ display: "flex", flexDirection: "column" }}
    >
      {imageUrl && (
        <CardSection mb="md">
          <Image src={imageUrl} height={160} alt={title} />
        </CardSection>
      )}

      <Group justify="space-between" align="flex-start" mb="xs">
        <Group gap="xs" style={{ flexWrap: "wrap" }}>
          <Badge variant="light" color="blue">
            {identifier}
          </Badge>
          {projectName && (
            <Badge variant="dot" color="gray" size="sm">
              {projectName}
            </Badge>
          )}
        </Group>
        {pptEstimate > 0 ? (
          <Text fw={700} c="green" fz="sm">
            RM{pptEstimate}
          </Text>
        ) : (
          <Text fz="sm" fw={700} c="green">
            RM20 - RM100
          </Text>
        )}
      </Group>

      <Title order={4} size="h5" lineClamp={2} mb="xs">
        {title}
      </Title>
      <div style={{ marginBottom: "var(--mantine-spacing-md)" }}>
        <DescriptionContent text={description} lines={3} />
      </div>

      <Group
        justify="space-between"
        align="center"
        mt="auto"
        pt="md"
        style={{
          borderTop: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <Stack gap={2}>
          <Text fz="xs" c="dimmed">
            Complexity: {estimate ? `${estimate} pts` : "Unestimated"}
          </Text>
          {assigneeName && (
            <Text fz="xs" c="yellow">
              Assigned: {assigneeName}
            </Text>
          )}
        </Stack>
        <Group gap="xs">
          <Anchor href={url} target="_blank" fz="xs" fw={500}>
            Linear &rarr;
          </Anchor>
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
  );
}

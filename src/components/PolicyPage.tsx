"use client";

import { Card, Container, Stack, Title, Typography } from "@mantine/core";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MermaidDiagram from "./MermaidDiagram";

/**
 * Split markdown content into alternating text and mermaid diagram segments.
 * Mermaid blocks are identified by ```mermaid fenced code blocks.
 */
function splitMermaidBlocks(
  content: string,
): Array<{ type: "markdown" | "mermaid"; content: string }> {
  const segments: Array<{ type: "markdown" | "mermaid"; content: string }> = [];
  const regex = /```mermaid\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    // Add preceding markdown
    const before = content.slice(lastIndex, match.index).trim();
    if (before) {
      segments.push({ type: "markdown", content: before });
    }
    // Add mermaid diagram
    segments.push({ type: "mermaid", content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining markdown
  const remaining = content.slice(lastIndex).trim();
  if (remaining) {
    segments.push({ type: "markdown", content: remaining });
  }

  return segments;
}

export default function PolicyPage({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  const segments = splitMermaidBlocks(content);

  return (
    <Container size="md" py="xl">
      <Title order={1} mb="xl">
        {title}
      </Title>
      <Stack gap="md">
        {segments.map((segment, i) =>
          segment.type === "mermaid" ? (
            <MermaidDiagram key={i} chart={segment.content} />
          ) : (
            <Card key={i} withBorder radius="md" padding="xl">
              <Typography>
                <Markdown remarkPlugins={[remarkGfm]}>
                  {segment.content}
                </Markdown>
              </Typography>
            </Card>
          ),
        )}
      </Stack>
    </Container>
  );
}

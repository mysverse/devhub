"use client";

import { Card, Container, Stack, Title, Typography } from "@mantine/core";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MermaidDiagram from "./MermaidDiagram";

type Segment = {
  /** Byte offset of this segment in the source content — stable within a render and unique per segment. */
  id: number;
  type: "markdown" | "mermaid";
  content: string;
};

/**
 * Split markdown content into alternating text and mermaid diagram segments.
 * Mermaid blocks are identified by ```mermaid fenced code blocks. Each segment
 * carries its source offset as `id` so React can use a stable key.
 */
function splitMermaidBlocks(content: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /```mermaid\n([\s\S]*?)```/g;
  let lastIndex = 0;

  for (const match of content.matchAll(regex)) {
    const matchIdx = match.index ?? 0;
    const before = content.slice(lastIndex, matchIdx).trim();
    if (before) {
      segments.push({ id: lastIndex, type: "markdown", content: before });
    }
    segments.push({ id: matchIdx, type: "mermaid", content: match[1].trim() });
    lastIndex = matchIdx + match[0].length;
  }

  const remaining = content.slice(lastIndex).trim();
  if (remaining) {
    segments.push({ id: lastIndex, type: "markdown", content: remaining });
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
        {segments.map((segment) =>
          segment.type === "mermaid" ? (
            <MermaidDiagram key={segment.id} chart={segment.content} />
          ) : (
            <Card key={segment.id} withBorder radius="md" padding="xl">
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

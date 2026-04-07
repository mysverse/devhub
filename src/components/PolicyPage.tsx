"use client";

import { Card, Container, Title, Typography } from "@mantine/core";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MermaidDiagram from "./MermaidDiagram";

const markdownComponents: Components = {
  code({ className, children }) {
    if (className === "language-mermaid") {
      return <MermaidDiagram chart={String(children).trim()} />;
    }
    return <code className={className}>{children}</code>;
  },
  pre({ children }) {
    // Don't wrap MermaidDiagram in <pre>
    return <>{children}</>;
  },
};

export default function PolicyPage({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  return (
    <Container size="md" py="xl">
      <Title order={1} mb="xl">
        {title}
      </Title>
      <Card withBorder radius="md" padding="xl">
        <Typography>
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content}
          </Markdown>
        </Typography>
      </Card>
    </Container>
  );
}

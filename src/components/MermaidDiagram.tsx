"use client";

import { Card, Skeleton } from "@mantine/core";
import { useEffect, useId, useRef, useState } from "react";

export default function MermaidDiagram({ chart }: { chart: string }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          darkMode: true,
          background: "#25262b",
          primaryColor: "#228be6",
          primaryTextColor: "#c1c2c5",
          primaryBorderColor: "#373a40",
          lineColor: "#909296",
          secondaryColor: "#2c2e33",
          tertiaryColor: "#1a1b1e",
        },
      });

      const mermaidId = `mermaid-${id.replace(/:/g, "")}`;

      try {
        const { svg } = await mermaid.render(mermaidId, chart);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setRendered(true);
        }
      } catch (err) {
        console.error("[mermaid] Render failed:", err);
        if (!cancelled && ref.current) {
          ref.current.textContent = chart;
          setRendered(true);
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  return (
    <Card withBorder radius="md" padding="lg" my="md">
      {!rendered && <Skeleton height={200} radius="md" />}
      <div
        ref={ref}
        style={{
          display: rendered ? "block" : "none",
          overflow: "auto",
          textAlign: "center",
        }}
      />
    </Card>
  );
}

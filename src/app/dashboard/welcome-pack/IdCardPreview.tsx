"use client";

import { Box, Text } from "@mantine/core";

export type IdCardPreviewProps = {
  templateUrl: string | null | undefined;
  templateWidth: number | null | undefined;
  templateHeight: number | null | undefined;
  nameX: number | null | undefined;
  nameY: number | null | undefined;
  fontSize: number | null | undefined;
  fontColor: string | null | undefined;
  fontFamily: string | null | undefined;
  name: string;
  /** Max rendered width in CSS pixels. Aspect ratio is preserved. */
  maxWidth?: number;
};

const DEFAULT_MAX_WIDTH = 360;
const DEFAULT_FONT_SIZE = 24;
const DEFAULT_FONT_COLOR = "#ffffff";
const DEFAULT_FONT_FAMILY = "monospace";

export default function IdCardPreview({
  templateUrl,
  templateWidth,
  templateHeight,
  nameX,
  nameY,
  fontSize,
  fontColor,
  fontFamily,
  name,
  maxWidth = DEFAULT_MAX_WIDTH,
}: IdCardPreviewProps) {
  if (!templateUrl) {
    return (
      <Box
        p="md"
        ta="center"
        style={{
          border: "1px dashed var(--mantine-color-dark-3)",
          borderRadius: "var(--mantine-radius-md)",
          color: "var(--mantine-color-dimmed)",
          minHeight: 140,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text size="sm" c="dimmed">
          Upload an ID card template to preview the layout.
        </Text>
      </Box>
    );
  }

  const naturalW = templateWidth || 600;
  const naturalH = templateHeight || 380;
  const scale = Math.min(1, maxWidth / naturalW);
  const renderedW = Math.round(naturalW * scale);
  const renderedH = Math.round(naturalH * scale);

  const overlayLeft = Math.round((nameX ?? 0) * scale);
  const overlayTop = Math.round((nameY ?? 0) * scale);
  const overlayFontSize = Math.max(
    8,
    Math.round((fontSize ?? DEFAULT_FONT_SIZE) * scale),
  );

  return (
    <Box
      style={{
        position: "relative",
        width: renderedW,
        height: renderedH,
        maxWidth: "100%",
        borderRadius: "var(--mantine-radius-md)",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: layered native img keeps absolute-positioned overlay aligned with template's natural pixel grid */}
      <img
        src={templateUrl}
        alt="ID card template"
        width={renderedW}
        height={renderedH}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      <Box
        style={{
          position: "absolute",
          left: overlayLeft,
          top: overlayTop,
          fontSize: overlayFontSize,
          color: fontColor || DEFAULT_FONT_COLOR,
          fontFamily: fontFamily || DEFAULT_FONT_FAMILY,
          fontWeight: 600,
          lineHeight: 1,
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {name || "Your name"}
      </Box>
    </Box>
  );
}

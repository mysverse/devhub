"use client";

import { Box, Text } from "@mantine/core";
import { useLayoutEffect, useRef, useState } from "react";

export type IdCardWrapMode = "nowrap" | "truncate" | "wrap" | "shrink";
export type IdCardAlign = "left" | "center" | "right";

export type IdCardPreviewProps = {
  templateUrl: string | null | undefined;
  templateWidth: number | null | undefined;
  templateHeight: number | null | undefined;
  nameX: number | null | undefined;
  nameY: number | null | undefined;
  fontSize: number | null | undefined;
  fontColor: string | null | undefined;
  fontFamily: string | null | undefined;
  /** Optional: max width of the name box in template px. */
  nameMaxWidth?: number | null;
  /** Optional: max height of the name box in template px. */
  nameMaxHeight?: number | null;
  /** Optional: text alignment within the name box (defaults to "left"). */
  nameAlign?: IdCardAlign | null;
  /** Optional: how to handle names that exceed the box (defaults to "nowrap"). */
  nameWrapMode?: IdCardWrapMode | null;
  /** When true, draws a faint outline around the name box for admin tuning. */
  showBoxOutline?: boolean;
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
  nameMaxWidth,
  nameMaxHeight,
  nameAlign,
  nameWrapMode,
  showBoxOutline,
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
  const baseFontSize = fontSize ?? DEFAULT_FONT_SIZE;
  const overlayFontSize = Math.max(8, Math.round(baseFontSize * scale));
  const overlayMaxWidth =
    nameMaxWidth && nameMaxWidth > 0 ? Math.round(nameMaxWidth * scale) : null;
  const overlayMaxHeight =
    nameMaxHeight && nameMaxHeight > 0
      ? Math.round(nameMaxHeight * scale)
      : null;

  const align: IdCardAlign = nameAlign ?? "left";
  const wrapMode: IdCardWrapMode = nameWrapMode ?? "nowrap";

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
      <NameOverlay
        left={overlayLeft}
        top={overlayTop}
        maxWidth={overlayMaxWidth}
        maxHeight={overlayMaxHeight}
        fontSize={overlayFontSize}
        fontColor={fontColor || DEFAULT_FONT_COLOR}
        fontFamily={fontFamily || DEFAULT_FONT_FAMILY}
        align={align}
        wrapMode={wrapMode}
        showBoxOutline={Boolean(showBoxOutline)}
        name={name || "Your name"}
      />
    </Box>
  );
}

function NameOverlay({
  left,
  top,
  maxWidth,
  maxHeight,
  fontSize,
  fontColor,
  fontFamily,
  align,
  wrapMode,
  showBoxOutline,
  name,
}: {
  left: number;
  top: number;
  maxWidth: number | null;
  maxHeight: number | null;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  align: IdCardAlign;
  wrapMode: IdCardWrapMode;
  showBoxOutline: boolean;
  name: string;
}) {
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [shrinkScale, setShrinkScale] = useState(1);

  // Shrink mode: measure rendered text width and reduce scale to fit. The
  // dependencies include `name`, `fontSize`, and `fontFamily` because they
  // affect `scrollWidth` even though they aren't read in the effect body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollWidth depends on the rendered text/font, which is a DOM-level effect of these props.
  useLayoutEffect(() => {
    if (wrapMode !== "shrink" || !maxWidth) {
      setShrinkScale(1);
      return;
    }
    const el = measureRef.current;
    if (!el) return;
    const naturalWidth = el.scrollWidth;
    if (naturalWidth <= maxWidth) {
      setShrinkScale(1);
      return;
    }
    setShrinkScale(maxWidth / naturalWidth);
  }, [wrapMode, maxWidth, name, fontSize, fontFamily]);

  const sharedStyle: React.CSSProperties = {
    color: fontColor,
    fontFamily,
    fontWeight: 600,
    lineHeight: 1.05,
    textAlign: align,
    pointerEvents: "none",
  };

  const boxStyle: React.CSSProperties = {
    position: "absolute",
    left,
    top,
    fontSize,
    ...(maxWidth ? { width: maxWidth } : {}),
    ...(maxHeight ? { maxHeight, overflow: "hidden" } : {}),
    ...(showBoxOutline && maxWidth
      ? { outline: "1px dashed rgba(255,255,255,0.4)" }
      : {}),
    ...sharedStyle,
  };

  if (wrapMode === "wrap") {
    return (
      <Box
        style={{
          ...boxStyle,
          whiteSpace: "normal",
          overflowWrap: "break-word",
          wordBreak: "break-word",
        }}
      >
        {name}
      </Box>
    );
  }

  if (wrapMode === "truncate") {
    return (
      <Box
        style={{
          ...boxStyle,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {name}
      </Box>
    );
  }

  if (wrapMode === "shrink") {
    // Scale the rendered text down using transform so the visual font size
    // shrinks but the layout box still anchors at (left, top) with the
    // configured alignment baseline.
    const transformOrigin =
      align === "right"
        ? "right top"
        : align === "center"
          ? "center top"
          : "left top";

    return (
      <Box
        style={{
          ...boxStyle,
          whiteSpace: "nowrap",
          overflow: "visible",
        }}
      >
        <span
          ref={measureRef}
          style={{
            display: "inline-block",
            transform: `scale(${shrinkScale})`,
            transformOrigin,
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
      </Box>
    );
  }

  // nowrap (default) — may overflow.
  return (
    <Box
      style={{
        ...boxStyle,
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </Box>
  );
}

"use client";

import { Box, Text } from "@mantine/core";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
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
  /** When true, the card tilts subtly under the mouse and shows a hover lift. */
  interactive?: boolean;
  name: string;
  /** Max rendered width in CSS pixels. Aspect ratio is preserved. */
  maxWidth?: number;
};

const DEFAULT_MAX_WIDTH = 360;
const DEFAULT_FONT_SIZE = 24;
const DEFAULT_FONT_COLOR = "#ffffff";
const DEFAULT_FONT_FAMILY = "monospace";
const TILT_DEGREES = 6;

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
  interactive,
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
    <Box style={{ perspective: interactive ? 1200 : undefined }}>
      <CardSurface
        renderedW={renderedW}
        renderedH={renderedH}
        interactive={Boolean(interactive)}
      >
        {/* biome-ignore lint/performance/noImgElement: layered native img keeps absolute-positioned overlay aligned with template's natural pixel grid */}
        <img
          src={templateUrl}
          alt="ID card template"
          width={renderedW}
          height={renderedH}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
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
        {interactive && <CardShine />}
      </CardSurface>
    </Box>
  );
}

function CardSurface({
  renderedW,
  renderedH,
  interactive,
  children,
}: {
  renderedW: number;
  renderedH: number;
  interactive: boolean;
  children: React.ReactNode;
}) {
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 180, damping: 18 });
  const y = useSpring(rawY, { stiffness: 180, damping: 18 });
  const rotateY = useTransform(x, [-0.5, 0.5], [-TILT_DEGREES, TILT_DEGREES]);
  const rotateX = useTransform(y, [-0.5, 0.5], [TILT_DEGREES, -TILT_DEGREES]);

  const sharedStyle = {
    position: "relative" as const,
    width: renderedW,
    height: renderedH,
    maxWidth: "100%",
    borderRadius: "var(--mantine-radius-md)",
    overflow: "hidden",
    boxShadow: "0 8px 24px -10px rgba(0,0,0,0.6)",
  };

  if (!interactive) {
    return <Box style={sharedStyle}>{children}</Box>;
  }

  return (
    <motion.div
      style={{
        ...sharedStyle,
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        cursor: "pointer",
      }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        rawX.set((event.clientX - rect.left) / rect.width - 0.5);
        rawY.set((event.clientY - rect.top) / rect.height - 0.5);
      }}
      onPointerLeave={() => {
        rawX.set(0);
        rawY.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

function CardShine() {
  return (
    <motion.div
      aria-hidden
      initial={{ x: "-150%" }}
      animate={{ x: "150%" }}
      transition={{
        duration: 6,
        repeat: Infinity,
        repeatDelay: 4,
        ease: "easeInOut",
      }}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        width: "40%",
        pointerEvents: "none",
        background:
          "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.10) 45%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.10) 55%, transparent 100%)",
        mixBlendMode: "screen",
      }}
    />
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

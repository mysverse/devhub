import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/config";
import { getSocialPreview, normalizeSocialPath } from "@/lib/social-previews";

const fontFiles = [
  { file: "Geist-Regular.ttf", weight: 400 },
  { file: "Geist-SemiBold.ttf", weight: 600 },
  { file: "Geist-Bold.ttf", weight: 700 },
] as const;

async function loadFonts() {
  const fonts = await Promise.all(
    fontFiles.map(async ({ file, weight }) => {
      try {
        return {
          name: "Geist",
          data: await readFile(
            new URL(`../../../assets/fonts/${file}`, import.meta.url),
          ),
          style: "normal" as const,
          weight,
        };
      } catch {
        return null;
      }
    }),
  );

  return fonts.filter((font) => font !== null);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = normalizeSocialPath(url.searchParams.get("path"));
  const preview = getSocialPreview(path);
  const fonts = await loadFonts();
  const logoUrl = new URL("/devhub.svg", request.url).toString();
  const fontFamily = fonts.length > 0 ? "Geist" : "Arial";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 68,
        color: "#f8fafc",
        backgroundColor: "#101113",
        fontFamily,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, #101113 0%, #142033 54%, #111827 100%)",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          right: 0,
          top: 0,
          width: 286,
          height: 630,
          backgroundColor: "rgba(34, 139, 230, 0.14)",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          bottom: 0,
          width: 1200,
          height: 10,
          backgroundColor: "#228be6",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 68,
          top: 174,
          width: 168,
          height: 4,
          backgroundColor: "#74c0fc",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: next/og renders this inside a generated image, not a browser document. */}
        <img
          src={logoUrl}
          alt={`${siteConfig.appName} logo`}
          width={378}
          height={76}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            border: "1px solid rgba(148, 163, 184, 0.38)",
            borderRadius: 999,
            padding: "12px 22px",
            color: "#bfdbfe",
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: 0,
            backgroundColor: "rgba(15, 23, 42, 0.58)",
          }}
        >
          {preview.label}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          maxWidth: 920,
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#93c5fd",
            fontSize: 28,
            fontWeight: 600,
          }}
        >
          {siteConfig.name}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            lineHeight: 0.96,
            fontWeight: 700,
            letterSpacing: 0,
          }}
        >
          {preview.title}
        </div>
        <div
          style={{
            display: "flex",
            color: "#cbd5e1",
            fontSize: 34,
            lineHeight: 1.28,
            maxWidth: 900,
          }}
        >
          {preview.description}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#94a3b8",
          fontSize: 24,
          position: "relative",
        }}
      >
        <div style={{ display: "flex" }}>{siteConfig.appName}</div>
        <div style={{ display: "flex" }}>{normalizeSocialPath(path)}</div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );
}

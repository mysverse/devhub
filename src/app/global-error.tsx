"use client";

import { useEffect } from "react";

/**
 * Catastrophic fallback for errors thrown in the root layout itself. It replaces
 * the root layout, so it must render its own <html>/<body> and cannot rely on any
 * provider (Mantine, fonts) being mounted — keep it plain and self-contained.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global render error:", error.digest ?? error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0b0d",
          color: "#e9e9ec",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#9a9aa2", marginBottom: 24 }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "8px 18px",
              borderRadius: 6,
              border: "none",
              background: "#228be6",
              color: "white",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

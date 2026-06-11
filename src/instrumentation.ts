export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (
    process.env.NEXT_PUBLIC_DEV_MODE === "true" &&
    process.env.DEV_MODE !== "true"
  ) {
    console.warn(
      "[dev-mode] NEXT_PUBLIC_DEV_MODE=true but DEV_MODE is unset — the UI " +
        "banner will show but nothing is mocked. A stale line in .env.local? " +
        "Use `pnpm dev:mock` to run dev mode properly.",
    );
  }

  if (process.env.DEV_MODE !== "true") return;

  const { assertDevModeSafety } = await import("@/lib/dev-mode");
  assertDevModeSafety();

  const { installDevFetchInterceptor } = await import("@/dev/intercept");
  installDevFetchInterceptor();

  const { startDevBlobServer } = await import("@/dev/blob-server");
  startDevBlobServer();
}

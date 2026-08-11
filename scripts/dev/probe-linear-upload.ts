/**
 * Measures the real per-file ceiling of Linear's `fileUpload` GraphQL path.
 *
 * Linear's help pages state 10 MB per file on free plans and 25 MB for
 * email-created issues, but document nothing for the API upload path. The
 * video limit in `src/lib/ppt-attachment-policy.ts` is a guess until this has
 * run — treat the constant there as unresearched, not as researched fact.
 *
 * Uploads synthetic buffers and reports the first size at which either the
 * mutation or the PUT fails. Nothing is attached to an issue, so the assets
 * are orphaned and invisible in the workspace UI.
 *
 * Usage:
 *   LINEAR_SERVICE_API_KEY=lin_api_… pnpm exec tsx scripts/dev/probe-linear-upload.ts
 *   … pnpm exec tsx scripts/dev/probe-linear-upload.ts 5,10,25,50
 */

import { LinearClient } from "@linear/sdk";

const MB = 1024 * 1024;
const DEFAULT_SIZES_MB = [5, 10, 25, 50, 100];

type ProbeResult = {
  sizeMb: number;
  ok: boolean;
  stage: "mutation" | "put";
  status?: number;
  detail?: string;
};

type UploadFile = {
  uploadUrl?: string | null;
  assetUrl?: string | null;
  headers?: { key?: string | null; value?: string | null }[] | null;
};

/**
 * A buffer that is a valid MP4 as far as magic-byte sniffing is concerned.
 * Object storage does not care, but uploading something that would fail our
 * own verifier would make a pass here meaningless.
 */
function syntheticMp4(bytes: number) {
  const buffer = Buffer.alloc(bytes);
  buffer.writeUInt32BE(0x20, 0);
  buffer.write("ftypisom", 4, "ascii");
  return buffer;
}

async function probe(
  client: LinearClient,
  sizeMb: number,
): Promise<ProbeResult> {
  const bytes = sizeMb * MB;
  const body = syntheticMp4(bytes);
  const filename = `devhub-probe-${sizeMb}mb.mp4`;

  let uploadFile: UploadFile | null | undefined;
  try {
    const payload = (await client.fileUpload("video/mp4", filename, bytes)) as {
      success?: boolean;
      uploadFile?: UploadFile | null;
    };
    if (!payload.success || !payload.uploadFile?.uploadUrl) {
      return {
        sizeMb,
        ok: false,
        stage: "mutation",
        detail: "fileUpload returned no upload URL",
      };
    }
    uploadFile = payload.uploadFile;
  } catch (error) {
    return {
      sizeMb,
      ok: false,
      stage: "mutation",
      detail: (error as Error).message,
    };
  }

  const headers = new Headers({ "Content-Type": "video/mp4" });
  for (const header of uploadFile.headers ?? []) {
    if (header.key && header.value) headers.set(header.key, header.value);
  }

  try {
    const response = await fetch(uploadFile.uploadUrl as string, {
      method: "PUT",
      headers,
      body: body as unknown as BodyInit,
    });
    return {
      sizeMb,
      ok: response.ok,
      stage: "put",
      status: response.status,
      detail: response.ok ? undefined : await response.text().catch(() => ""),
    };
  } catch (error) {
    return {
      sizeMb,
      ok: false,
      stage: "put",
      detail: (error as Error).message,
    };
  }
}

async function main() {
  const apiKey =
    process.env.LINEAR_SERVICE_API_KEY ?? process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.error(
      "❌ Set LINEAR_SERVICE_API_KEY (or LINEAR_API_KEY) to a real Linear token.\n" +
        "   This probe must run against real Linear — dev-mock intercepts the\n" +
        "   upload and would report a ceiling that does not exist.",
    );
    process.exit(1);
  }

  const sizes = (process.argv[2]?.split(",").map(Number) ?? DEFAULT_SIZES_MB)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  const client = new LinearClient({ apiKey });
  console.log(`🔍 Probing Linear fileUpload at ${sizes.join(", ")} MB…\n`);

  let lastOk: number | null = null;
  for (const sizeMb of sizes) {
    const result = await probe(client, sizeMb);
    if (result.ok) {
      lastOk = sizeMb;
      console.log(`  ✅ ${sizeMb} MB — uploaded (${result.status})`);
      continue;
    }

    const status = result.status ? ` ${result.status}` : "";
    console.log(
      `  ❌ ${sizeMb} MB — failed at ${result.stage}${status}: ${(result.detail ?? "").slice(0, 200)}`,
    );
    break;
  }

  console.log("");
  if (lastOk === null) {
    console.log(
      "No size succeeded. Check the token's scopes and the workspace plan.",
    );
    process.exit(1);
  }
  console.log(
    `Largest successful upload: ${lastOk} MB.\n` +
      `Set ATTACHMENT_CATEGORIES.video.maxBytes in src/lib/ppt-attachment-policy.ts\n` +
      `to a value at or below this, and drop the "provisional" note on it.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

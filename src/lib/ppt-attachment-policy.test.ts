import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATTACHMENT_MAX_FILES,
  acceptForSurface,
  categoryForMimeType,
  checkAttachmentSelection,
  describeAttachmentLimits,
  formatFileSize,
  isAttachmentImage,
  isAttachmentMimeType,
  isAttachmentVideo,
  maxBytesFor,
  maxTotalBytesForSurface,
  PROXY_MAX_BYTES,
  transportForSize,
} from "@/lib/ppt-attachment-policy";

const MB = 1024 * 1024;

const file = (
  over: Partial<{ name: string; size: number; type: string }> = {},
) => ({
  name: "shot.png",
  size: 200 * 1024,
  type: "image/png",
  ...over,
});

describe("categoryForMimeType", () => {
  it("classifies every supported type", () => {
    assert.equal(categoryForMimeType("image/webp"), "image");
    assert.equal(categoryForMimeType("application/pdf"), "pdf");
    assert.equal(categoryForMimeType("video/quicktime"), "video");
  });

  it("returns null for anything else", () => {
    assert.equal(categoryForMimeType("audio/mpeg"), null);
    assert.equal(categoryForMimeType(""), null);
  });
});

describe("type guards", () => {
  it("agree with the category map", () => {
    assert.equal(isAttachmentMimeType("video/mp4"), true);
    assert.equal(isAttachmentMimeType("image/gif"), false);
    assert.equal(isAttachmentImage("image/jpeg"), true);
    assert.equal(isAttachmentImage("application/pdf"), false);
    assert.equal(isAttachmentVideo("video/webm"), true);
  });
});

describe("transportForSize", () => {
  it("keeps files that fit inside Vercel's body cap on the proxy path", () => {
    assert.equal(transportForSize(1), "proxy");
    assert.equal(transportForSize(PROXY_MAX_BYTES), "proxy");
  });

  it("routes anything larger through the relay", () => {
    // A byte over the cap would 413 before the route handler ran at all.
    assert.equal(transportForSize(PROXY_MAX_BYTES + 1), "relay");
    assert.equal(transportForSize(20 * MB), "relay");
  });
});

describe("formatFileSize", () => {
  it("uses MB above a megabyte and KB below", () => {
    assert.equal(formatFileSize(18.4 * MB), "18.4 MB");
    assert.equal(formatFileSize(512 * 1024), "512 KB");
  });

  it("never reports a non-empty file as 0 KB", () => {
    assert.equal(formatFileSize(1), "1 KB");
  });
});

describe("surface allowlists", () => {
  it("excludes video from PPT requests but allows it on comments", () => {
    assert.ok(!acceptForSurface("ppt-request").includes("video/"));
    assert.ok(acceptForSurface("ppt-comment").includes("video/mp4"));
  });

  it("describes limits without hardcoding numbers in the UI", () => {
    const copy = describeAttachmentLimits("ppt-comment");
    assert.match(copy, new RegExp(`${ATTACHMENT_MAX_FILES} files`));
    assert.match(copy, /video/);
  });

  it("caps a PPT request at what a single multipart POST can carry", () => {
    // Every request file goes up in one body, and Vercel rejects bodies over
    // ~4.5 MB before the route runs. Advertising more than this is a lie.
    assert.equal(maxTotalBytesForSurface("ppt-request"), PROXY_MAX_BYTES);
    assert.match(describeAttachmentLimits("ppt-request"), /4 MB total/);
  });

  it("lets comments exceed the body cap, since each file uploads separately", () => {
    assert.ok(maxTotalBytesForSurface("ppt-comment") > PROXY_MAX_BYTES);
  });
});

describe("checkAttachmentSelection", () => {
  it("accepts a normal selection", () => {
    assert.equal(
      checkAttachmentSelection([file(), file()], "ppt-comment"),
      null,
    );
  });

  it("accepts an empty selection", () => {
    assert.equal(checkAttachmentSelection([], "ppt-comment"), null);
  });

  it("rejects too many files", () => {
    const many = Array.from({ length: ATTACHMENT_MAX_FILES + 1 }, () => file());
    assert.match(
      checkAttachmentSelection(many, "ppt-comment")?.error ?? "",
      new RegExp(`up to ${ATTACHMENT_MAX_FILES} files`),
    );
  });

  it("rejects an unsupported type by name", () => {
    const rejection = checkAttachmentSelection(
      [file({ name: "notes.txt", type: "text/plain" })],
      "ppt-comment",
    );
    assert.match(rejection?.error ?? "", /notes\.txt/);
  });

  it("rejects video on the request surface even though it is a known type", () => {
    const rejection = checkAttachmentSelection(
      [file({ name: "clip.mp4", type: "video/mp4", size: 5 * MB })],
      "ppt-request",
    );
    assert.match(rejection?.error ?? "", /clip\.mp4/);
  });

  it("applies the per-category size cap", () => {
    const rejection = checkAttachmentSelection(
      [file({ size: maxBytesFor("image/png") + 1 })],
      "ppt-comment",
    );
    assert.match(rejection?.error ?? "", /the limit is 10 MB/);
  });

  it("clamps a per-file cap to what the surface can actually carry", () => {
    // A 6 MB image is inside the 10 MB image cap but cannot reach the request
    // route at all, so it must be refused with the number that really applies.
    const rejection = checkAttachmentSelection(
      [file({ size: 6 * MB })],
      "ppt-request",
    );
    assert.match(rejection?.error ?? "", /the limit is 4 MB/);
    assert.equal(
      checkAttachmentSelection([file({ size: 6 * MB })], "ppt-comment"),
      null,
    );
  });

  it("applies the total cap across files that each fit individually", () => {
    const total = maxTotalBytesForSurface("ppt-comment");
    const each = Math.floor(total / ATTACHMENT_MAX_FILES) + 1;
    assert.ok(
      each <= maxBytesFor("video/mp4"),
      "each file must clear its own cap",
    );

    const rejection = checkAttachmentSelection(
      Array.from({ length: ATTACHMENT_MAX_FILES }, (_, i) =>
        file({ type: "video/mp4", name: `clip-${i}.mp4`, size: each }),
      ),
      "ppt-comment",
    );
    assert.match(rejection?.error ?? "", /the limit is/);
  });
});

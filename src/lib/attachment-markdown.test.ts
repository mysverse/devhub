import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attachmentMarkdown } from "@/lib/attachment-markdown";

const image = {
  filename: "toll-after.webp",
  mimeType: "image/webp",
  linearAssetUrl: "https://uploads.linear.app/a/toll-after.webp",
};
const pdf = {
  filename: "spec.pdf",
  mimeType: "application/pdf",
  linearAssetUrl: "https://uploads.linear.app/b/spec.pdf",
};
const video = {
  filename: "drive-through.mp4",
  mimeType: "video/mp4",
  linearAssetUrl: "https://uploads.linear.app/c/drive-through.mp4",
  byteSize: 18.4 * 1024 * 1024,
};

describe("attachmentMarkdown", () => {
  it("returns nothing for an empty list", () => {
    assert.equal(attachmentMarkdown([]), "");
  });

  it("embeds images inline", () => {
    assert.equal(
      attachmentMarkdown([image], { heading: null }),
      "![toll-after.webp](https://uploads.linear.app/a/toll-after.webp)",
    );
  });

  it("links non-image files rather than embedding them", () => {
    assert.equal(
      attachmentMarkdown([pdf], { heading: null }),
      "- [spec.pdf](https://uploads.linear.app/b/spec.pdf)",
    );
  });

  it("links video with its size, never as an image embed", () => {
    const out = attachmentMarkdown([video], { heading: null });
    // `![clip.mp4](…)` would render as a broken image in Linear.
    assert.ok(!out.startsWith("!["));
    assert.equal(
      out,
      "- [🎬 drive-through.mp4](https://uploads.linear.app/c/drive-through.mp4) (video, 18.4 MB)",
    );
  });

  it("omits the size when it is unknown", () => {
    const out = attachmentMarkdown([{ ...video, byteSize: null }], {
      heading: null,
    });
    assert.ok(out.endsWith("(video)"));
  });

  it("emits a heading by default and preserves order", () => {
    assert.equal(
      attachmentMarkdown([image, pdf]),
      [
        "## Attachments",
        "",
        "![toll-after.webp](https://uploads.linear.app/a/toll-after.webp)",
        "- [spec.pdf](https://uploads.linear.app/b/spec.pdf)",
      ].join("\n"),
    );
  });

  it("honours a custom heading", () => {
    assert.ok(
      attachmentMarkdown([image], { heading: "## Evidence" }).startsWith(
        "## Evidence\n\n",
      ),
    );
  });

  it("keeps the evidence marker the proof rule looks for", () => {
    // The posted body must contain `![` so the payout evaluator still sees
    // evidence when it reads the comment back off Linear.
    assert.match(attachmentMarkdown([image]), /!\[/);
  });
});

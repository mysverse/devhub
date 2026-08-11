import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATTACHMENT_SNIFF_BYTES,
  cleanFilename,
  extensionForMimeType,
  retypeFilename,
  sniffAttachmentMimeType,
} from "@/lib/attachment-magic";

/** Builds a header of ATTACHMENT_SNIFF_BYTES with `bytes` written at `offset`. */
function header(bytes: number[], offset = 0) {
  const out = new Uint8Array(ATTACHMENT_SNIFF_BYTES);
  out.set(bytes, offset);
  return out;
}

function ftyp(brand: string) {
  const out = new Uint8Array(ATTACHMENT_SNIFF_BYTES);
  // A real box-size prefix occupies bytes 0-4 and varies; the signature is at 4.
  out.set([0x00, 0x00, 0x00, 0x20], 0);
  out.set(
    [...("ftyp" + brand)].map((c) => c.charCodeAt(0)),
    4,
  );
  return out;
}

describe("sniffAttachmentMimeType", () => {
  it("detects the image formats", () => {
    assert.equal(
      sniffAttachmentMimeType(header([0xff, 0xd8, 0xff])),
      "image/jpeg",
    );
    assert.equal(
      sniffAttachmentMimeType(header([0x89, 0x50, 0x4e, 0x47])),
      "image/png",
    );

    const webp = new Uint8Array(ATTACHMENT_SNIFF_BYTES);
    webp.set(
      [..."RIFF"].map((c) => c.charCodeAt(0)),
      0,
    );
    webp.set(
      [..."WEBP"].map((c) => c.charCodeAt(0)),
      8,
    );
    assert.equal(sniffAttachmentMimeType(webp), "image/webp");
  });

  it("detects PDF", () => {
    const pdf = header([..."%PDF"].map((c) => c.charCodeAt(0)));
    assert.equal(sniffAttachmentMimeType(pdf), "application/pdf");
  });

  it("detects mp4 by brand, not by the ftyp box alone", () => {
    assert.equal(sniffAttachmentMimeType(ftyp("isom")), "video/mp4");
    assert.equal(sniffAttachmentMimeType(ftyp("mp42")), "video/mp4");
    assert.equal(sniffAttachmentMimeType(ftyp("avc1")), "video/mp4");
  });

  it("detects QuickTime", () => {
    assert.equal(sniffAttachmentMimeType(ftyp("qt  ")), "video/quicktime");
  });

  it("rejects audio-only ISO brands that share the ftyp box", () => {
    // The whole reason brand-checking exists: a bare `ftyp` check would let
    // an .m4a through as video.
    assert.equal(sniffAttachmentMimeType(ftyp("M4A ")), null);
    assert.equal(sniffAttachmentMimeType(ftyp("M4B ")), null);
  });

  it("detects WebM via the EBML header", () => {
    assert.equal(
      sniffAttachmentMimeType(header([0x1a, 0x45, 0xdf, 0xa3])),
      "video/webm",
    );
  });

  it("returns null for unrecognised and truncated input", () => {
    assert.equal(sniffAttachmentMimeType(header([0x4d, 0x5a])), null); // .exe
    assert.equal(sniffAttachmentMimeType(new Uint8Array([0xff])), null);
    assert.equal(sniffAttachmentMimeType(new Uint8Array()), null);
  });

  it("does not mistake a RIFF container that is not WebP", () => {
    const wav = new Uint8Array(ATTACHMENT_SNIFF_BYTES);
    wav.set(
      [..."RIFF"].map((c) => c.charCodeAt(0)),
      0,
    );
    wav.set(
      [..."WAVE"].map((c) => c.charCodeAt(0)),
      8,
    );
    assert.equal(sniffAttachmentMimeType(wav), null);
  });
});

describe("cleanFilename", () => {
  it("keeps a readable name", () => {
    assert.equal(
      cleanFilename("  toll-plaza (final) v2.png "),
      "toll-plaza (final) v2.png",
    );
  });

  it("replaces characters that are unsafe in storage keys and markdown", () => {
    assert.equal(cleanFilename("a/b\\c:d?.png"), "a_b_c_d_.png");
  });

  it("collapses whitespace and truncates", () => {
    assert.equal(cleanFilename("a   b"), "a b");
    assert.equal(cleanFilename("x".repeat(200)).length, 120);
  });

  it("falls back rather than returning an empty name", () => {
    assert.equal(cleanFilename("   "), "attachment");
    assert.equal(cleanFilename("///"), "___");
  });
});

describe("retypeFilename", () => {
  it("repoints the extension at the real type", () => {
    assert.equal(retypeFilename("photo.jpg", "image/webp"), "photo.webp");
    assert.equal(retypeFilename("clip.MOV", "video/quicktime"), "clip.mov");
  });

  it("appends when there is no extension", () => {
    assert.equal(retypeFilename("screenshot", "image/png"), "screenshot.png");
  });

  it("strips only the last segment when it is extension-shaped", () => {
    assert.equal(
      retypeFilename("build.2026.08.11.png", "image/webp"),
      "build.2026.08.11.webp",
    );
  });

  it("leaves a trailing segment too long to be an extension", () => {
    assert.equal(
      retypeFilename("render.finalcompositepass", "image/webp"),
      "render.finalcompositepass.webp",
    );
  });

  it("survives a name that cleans down to nothing", () => {
    assert.equal(retypeFilename("   ", "image/png"), "attachment.png");
  });
});

describe("extensionForMimeType", () => {
  it("maps every supported type", () => {
    assert.equal(extensionForMimeType("image/jpeg"), "jpg");
    assert.equal(extensionForMimeType("application/pdf"), "pdf");
    assert.equal(extensionForMimeType("video/quicktime"), "mov");
  });
});

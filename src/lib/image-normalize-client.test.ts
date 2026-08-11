import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldRecompress,
  targetDimensions,
} from "@/lib/image-normalize-client";

// Only the pure decision helpers are covered here — node:test has no canvas,
// so the encode path is exercised by the dev-mock browser run instead.

describe("targetDimensions", () => {
  it("leaves an image already within the bound alone", () => {
    assert.deepEqual(targetDimensions(1920, 1080, 2560), {
      width: 1920,
      height: 1080,
    });
  });

  it("leaves an image exactly on the bound alone", () => {
    assert.deepEqual(targetDimensions(2560, 1440, 2560), {
      width: 2560,
      height: 1440,
    });
  });

  it("scales the longest side down and preserves aspect ratio", () => {
    // A 4K phone photo: 4032x3024 (4:3).
    const out = targetDimensions(4032, 3024, 2560);
    assert.equal(out.width, 2560);
    assert.equal(out.height, 1920);
    assert.equal(out.width / out.height, 4032 / 3024);
  });

  it("scales by height when the image is portrait", () => {
    const out = targetDimensions(3024, 4032, 2560);
    assert.equal(out.height, 2560);
    assert.equal(out.width, 1920);
  });

  it("never rounds a dimension down to zero", () => {
    const out = targetDimensions(10000, 1, 2560);
    assert.equal(out.height, 1);
  });

  it("tolerates a zero-sized decode without dividing by zero", () => {
    assert.deepEqual(targetDimensions(0, 0, 2560), { width: 0, height: 0 });
  });
});

describe("shouldRecompress", () => {
  it("always re-encodes JPEG, however small", () => {
    // JPEG is the only format a phone camera writes GPS EXIF into, and canvas
    // re-encoding is what strips it.
    assert.equal(shouldRecompress("image/jpeg", 8 * 1024, 100, 100), true);
  });

  it("leaves a small PNG or WebP alone", () => {
    assert.equal(shouldRecompress("image/png", 60 * 1024, 800, 600), false);
    assert.equal(shouldRecompress("image/webp", 60 * 1024, 800, 600), false);
  });

  it("re-encodes a large PNG", () => {
    assert.equal(
      shouldRecompress("image/png", 3 * 1024 * 1024, 1200, 900),
      true,
    );
  });

  it("re-encodes an oversized PNG even when its file is small", () => {
    assert.equal(shouldRecompress("image/png", 40 * 1024, 5000, 400), true);
  });

  it("never touches PDFs or video", () => {
    assert.equal(
      shouldRecompress("application/pdf", 9 * 1024 * 1024, 0, 0),
      false,
    );
    assert.equal(
      shouldRecompress("video/mp4", 20 * 1024 * 1024, 1920, 1080),
      false,
    );
  });

  it("honours overridden thresholds", () => {
    assert.equal(
      shouldRecompress("image/png", 100 * 1024, 800, 600, {
        recompressAboveBytes: 50 * 1024,
      }),
      true,
    );
    assert.equal(
      shouldRecompress("image/png", 100 * 1024, 3000, 600, {
        maxDimension: 4000,
        recompressAboveBytes: 1024 * 1024,
      }),
      false,
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  firstProxiedImage,
  isDurableImageUrl,
  proxiedImageUrl,
} from "@/lib/linear-assets";

const LINEAR_ASSET = "https://uploads.linear.app/abc/shot.png";
const DISCORD_CDN =
  "https://cdn.discordapp.com/attachments/1/2/shot.png?ex=deadbeef";

describe("proxiedImageUrl", () => {
  it("routes Linear-hosted assets through the authenticated proxy", () => {
    assert.equal(
      proxiedImageUrl(LINEAR_ASSET),
      `/api/image-proxy?url=${encodeURIComponent(LINEAR_ASSET)}`,
    );
    assert.match(
      proxiedImageUrl("https://linear.app/x/y.png"),
      /^\/api\/image-proxy/,
    );
  });

  it("leaves every other host alone", () => {
    assert.equal(proxiedImageUrl(DISCORD_CDN), DISCORD_CDN);
    assert.equal(proxiedImageUrl("/local/shot.png"), "/local/shot.png");
  });

  it("does not proxy a lookalike host", () => {
    // `uploads.linear.app.evil.com` must not inherit our bearer token.
    const evil = "https://uploads.linear.app.evil.com/x.png";
    assert.equal(proxiedImageUrl(evil), evil);
  });

  it("returns unparseable input unchanged rather than throwing", () => {
    assert.equal(proxiedImageUrl("http://[::bad"), "http://[::bad");
  });
});

describe("isDurableImageUrl", () => {
  it("trusts Linear and our own blob storage", () => {
    assert.equal(isDurableImageUrl(LINEAR_ASSET), true);
    assert.equal(
      isDurableImageUrl("https://xyz.public.blob.vercel-storage.com/a.png"),
      true,
    );
  });

  it("trusts relative URLs, which we serve ourselves", () => {
    assert.equal(isDurableImageUrl("/api/image-proxy?url=x"), true);
  });

  it("flags a Discord CDN link — the case this feature exists for", () => {
    assert.equal(isDurableImageUrl(DISCORD_CDN), false);
  });

  it("flags arbitrary third-party hosts", () => {
    assert.equal(isDurableImageUrl("https://i.imgur.com/a.png"), false);
    assert.equal(
      isDurableImageUrl("https://evil.com/uploads.linear.app/a.png"),
      false,
    );
  });
});

describe("firstProxiedImage", () => {
  it("finds and proxies the first markdown image", () => {
    const body = `Some prose\n\n![shot](${LINEAR_ASSET})\n\n![other](${DISCORD_CDN})`;
    assert.equal(
      firstProxiedImage(body),
      `/api/image-proxy?url=${encodeURIComponent(LINEAR_ASSET)}`,
    );
  });

  it("returns null when there is no image", () => {
    assert.equal(firstProxiedImage("just words"), null);
    assert.equal(firstProxiedImage(null), null);
    assert.equal(firstProxiedImage(undefined), null);
    assert.equal(firstProxiedImage(""), null);
  });

  it("ignores a plain link that is not an embed", () => {
    assert.equal(firstProxiedImage(`[shot](${LINEAR_ASSET})`), null);
  });
});

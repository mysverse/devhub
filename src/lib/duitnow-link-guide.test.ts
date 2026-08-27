import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkGuideFor } from "@/lib/duitnow-link-guide";

describe("linkGuideFor", () => {
  it("names the app's own menu when it is one we know", () => {
    const guide = linkGuideFor("TNGDMYNB");
    assert.equal(guide?.app, "Touch ’n Go eWallet");
    assert.match(
      guide?.line ?? "",
      /^In Touch ’n Go eWallet: Profile → DuitNow/,
    );
  });

  it("falls back to a generic line that still names the app", () => {
    const guide = linkGuideFor("HLBBMYKL");
    assert.equal(guide?.app, "Hong Leong Bank");
    assert.match(guide?.line ?? "", /DuitNow.*Hong Leong Bank app/);
  });

  it("passes a legacy plain-text name through rather than dropping it", () => {
    assert.equal(linkGuideFor("Some Bank")?.app, "Some Bank");
  });

  it("has nothing to say before an app is chosen", () => {
    assert.equal(linkGuideFor(null), null);
    assert.equal(linkGuideFor(""), null);
  });
});

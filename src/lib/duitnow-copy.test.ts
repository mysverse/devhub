import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DUITNOW_ISSUE_COPY, duitNowIssueMessage } from "@/lib/duitnow-copy";

describe("duitNowIssueMessage", () => {
  it("names the app the developer said the ID was linked at", () => {
    const message = duitNowIssueMessage("NOT_FOUND", {
      institutionName: "TnG E-Wallet",
    });
    assert.ok(message.startsWith(DUITNOW_ISSUE_COPY.NOT_FOUND));
    assert.match(message, /linked at TnG E-Wallet/);
  });

  it("falls back to the generic wording when no app is on file", () => {
    assert.equal(
      duitNowIssueMessage("NOT_FOUND"),
      DUITNOW_ISSUE_COPY.NOT_FOUND,
    );
    assert.equal(
      duitNowIssueMessage("NOT_FOUND", { institutionName: null }),
      DUITNOW_ISSUE_COPY.NOT_FOUND,
    );
  });

  it("treats an unknown issue as not found", () => {
    assert.equal(duitNowIssueMessage(null), DUITNOW_ISSUE_COPY.NOT_FOUND);
    assert.equal(
      duitNowIssueMessage("SOMETHING"),
      DUITNOW_ISSUE_COPY.NOT_FOUND,
    );
  });

  it("does not send a name mismatch back to the app", () => {
    assert.equal(
      duitNowIssueMessage("NAME_MISMATCH", { institutionName: "Maybank" }),
      DUITNOW_ISSUE_COPY.NAME_MISMATCH,
    );
  });
});

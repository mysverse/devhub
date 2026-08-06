import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyDigestCohort,
  type DigestCandidate,
  type DigestWindows,
} from "@/lib/digest-cohort";

const NOW = new Date("2026-08-06T00:00:00.000Z");
const WINDOWS: DigestWindows = {
  activityCutoff: new Date("2026-06-07T00:00:00.000Z"), // 60 days back
  onboardingCutoff: new Date("2026-07-30T00:00:00.000Z"), // 7 days back
};

function candidate(overrides: Partial<DigestCandidate> = {}): DigestCandidate {
  return {
    hasLinearId: true,
    accountCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    lastWatchAt: null,
    lastTransactionAt: null,
    ...overrides,
  };
}

describe("classifyDigestCohort", () => {
  it("reaches a developer who onboarded and never claimed anything", () => {
    // The regression this whole change exists for: the old audience query
    // required a prior watch or transaction, so this developer — the one with
    // the worst activation — could never receive the email at all.
    assert.equal(classifyDigestCohort(candidate(), WINDOWS), "never-activated");
  });

  it("holds off during the onboarding grace period", () => {
    assert.equal(
      classifyDigestCohort(
        candidate({ accountCreatedAt: new Date("2026-08-04T00:00:00.000Z") }),
        WINDOWS,
      ),
      null,
    );
  });

  it("sends the link-Linear message when Linear isn't connected", () => {
    // Checked before activity: without a Linear link, no list of tasks is
    // actionable, however active they've been.
    assert.equal(
      classifyDigestCohort(candidate({ hasLinearId: false }), WINDOWS),
      "unlinked",
    );
    assert.equal(
      classifyDigestCohort(
        candidate({ hasLinearId: false, lastTransactionAt: NOW }),
        WINDOWS,
      ),
      "unlinked",
    );
  });

  it("treats old activity as lapsed and recent activity as idle", () => {
    assert.equal(
      classifyDigestCohort(
        candidate({ lastWatchAt: new Date("2026-01-15T00:00:00.000Z") }),
        WINDOWS,
      ),
      "lapsed",
    );
    assert.equal(
      classifyDigestCohort(
        candidate({ lastWatchAt: new Date("2026-08-01T00:00:00.000Z") }),
        WINDOWS,
      ),
      "idle",
    );
  });

  it("uses the most recent signal across watches and transactions", () => {
    assert.equal(
      classifyDigestCohort(
        candidate({
          lastWatchAt: new Date("2026-01-15T00:00:00.000Z"),
          lastTransactionAt: new Date("2026-08-01T00:00:00.000Z"),
        }),
        WINDOWS,
      ),
      "idle",
    );
  });

  it("ignores the grace period once someone has actually done something", () => {
    // Signed up two days ago and already claimed: they're active, not new.
    assert.equal(
      classifyDigestCohort(
        candidate({
          accountCreatedAt: new Date("2026-08-04T00:00:00.000Z"),
          lastWatchAt: new Date("2026-08-05T00:00:00.000Z"),
        }),
        WINDOWS,
      ),
      "idle",
    );
  });
});

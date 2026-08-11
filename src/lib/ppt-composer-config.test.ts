import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROOF_MIN_CHARS } from "@/lib/payout-policy";
import {
  describeUnmet,
  evaluateComposerRequirements,
  PPT_COMPOSER_MODES,
  type PptComposerMode,
  type RequirementContext,
  unmetRequired,
} from "@/lib/ppt-composer-config";
import { PPT_PROGRESS_TEMPLATE } from "@/lib/ppt-progress";
import { checkProofBody } from "@/lib/ppt-proof";

/** Long enough to clear PROOF_MIN_CHARS, with nothing checkable in it. */
const PROSE =
  "Rebuilt the toll plaza lighting rig so every lamp now uses the shared emitter.";

function ctx(body: string, attachmentCount = 0): RequirementContext {
  return { body, attachmentCount };
}

function met(mode: PptComposerMode, id: string, context: RequirementContext) {
  const result = evaluateComposerRequirements(mode, context).find(
    (row) => row.requirement.id === id,
  );
  assert.ok(result, `no requirement with id "${id}" in ${mode} mode`);
  return result.met;
}

describe("mode table", () => {
  it("keys every config by its own mode", () => {
    for (const [key, config] of Object.entries(PPT_COMPOSER_MODES)) {
      assert.equal(config.mode, key);
    }
  });

  it("gives every mode at least one blocking requirement", () => {
    for (const config of Object.values(PPT_COMPOSER_MODES)) {
      assert.ok(
        config.requirements.some((requirement) => requirement.required),
      );
    }
  });

  it("uses unique requirement ids within a mode", () => {
    for (const config of Object.values(PPT_COMPOSER_MODES)) {
      const ids = config.requirements.map((requirement) => requirement.id);
      assert.equal(new Set(ids).size, ids.length);
    }
  });
});

describe("proof requirements", () => {
  it("interpolates the shared minimum into the label so copy cannot drift", () => {
    const describe = PPT_COMPOSER_MODES.proof.requirements.find(
      (requirement) => requirement.id === "describe",
    );
    assert.match(describe?.label ?? "", new RegExp(`${PROOF_MIN_CHARS}`));
  });

  it("measures length with the proof marker stripped out", () => {
    const content = "a".repeat(PROOF_MIN_CHARS - 1);
    assert.equal(met("proof", "describe", ctx(`#ppt-proof ${content}`)), false);
    assert.equal(met("proof", "describe", ctx(`#ppt-proof ${content}a`)), true);
  });

  it("counts a link, a commit SHA, or an issue reference as evidence", () => {
    assert.equal(
      met("proof", "evidence", ctx(`${PROSE} https://example.com/clip`)),
      true,
    );
    assert.equal(
      met("proof", "evidence", ctx(`${PROSE} Commit 4f9a2b1.`)),
      true,
    );
    assert.equal(
      met("proof", "evidence", ctx(`${PROSE} Closes MYS-201.`)),
      true,
    );
  });

  it("rejects a bare claim of having evidence", () => {
    assert.equal(
      met(
        "proof",
        "evidence",
        ctx(`${PROSE} I took a screenshot and tested it.`),
      ),
      false,
    );
  });

  // The reason the composer passes an attachment count around at all: the
  // upload finishes long before the `![…](…)` markdown exists, and the
  // checklist has to go green at upload time or it reads as broken.
  it("lets an attachment satisfy the evidence row on its own", () => {
    assert.equal(met("proof", "evidence", ctx(PROSE, 0)), false);
    assert.equal(met("proof", "evidence", ctx(PROSE, 1)), true);
  });

  it("still demands the length minimum when a file is attached", () => {
    assert.equal(met("proof", "describe", ctx("done", 1)), false);
  });

  /**
   * The load-bearing property. The two required rows are split for legibility,
   * but together they must equal the single rule the server action and the
   * payout evaluator apply — otherwise proof the checklist calls complete
   * posts to Linear and then silently fails payout, which is the exact
   * regression `ppt-proof.ts` was created to end.
   */
  it("agrees with checkProofBody for every combination", () => {
    const bodies = [
      "",
      "done",
      "#ppt-proof done",
      PROSE,
      `${PROSE} https://example.com/clip`,
      `${PROSE} ![shot](https://uploads.linear.app/a.png)`,
      `${PROSE} Commit 4f9a2b1.`,
      "short but has https://example.com",
      `#ppt-proof ${"a".repeat(PROOF_MIN_CHARS)}`,
    ];

    for (const body of bodies) {
      for (const attachmentCount of [0, 2]) {
        const results = evaluateComposerRequirements(
          "proof",
          ctx(body, attachmentCount),
        );
        const composerSaysOk = unmetRequired(results).length === 0;
        const serverSaysOk =
          checkProofBody(body, { hasAttachments: attachmentCount > 0 }) ===
          null;
        assert.equal(
          composerSaysOk,
          serverSaysOk,
          `disagreed on ${JSON.stringify(body)} with ${attachmentCount} attachments`,
        );
      }
    }
  });

  it("treats 'where to see it' as advisory", () => {
    const location = PPT_COMPOSER_MODES.proof.requirements.find(
      (requirement) => requirement.id === "location",
    );
    assert.equal(location?.required, false);
    assert.equal(met("proof", "location", ctx(PROSE)), false);
    assert.equal(
      met("proof", "location", ctx(`${PROSE} It is live in the lobby place.`)),
      true,
    );
    // A link answers "where" as well as any sentence can.
    assert.equal(
      met("proof", "location", ctx(`${PROSE} https://example.com/clip`)),
      true,
    );
  });
});

describe("progress requirements", () => {
  it("blocks an untouched template", () => {
    assert.equal(
      met("progress", "substance", ctx(PPT_PROGRESS_TEMPLATE)),
      false,
    );
  });

  it("passes once a heading is actually filled in", () => {
    assert.equal(
      met(
        "progress",
        "substance",
        ctx(`${PPT_PROGRESS_TEMPLATE} rebuilt the spawn logic`),
      ),
      true,
    );
  });

  it("treats the bare 'Next step:' heading as unanswered", () => {
    assert.equal(met("progress", "next", ctx(PPT_PROGRESS_TEMPLATE)), false);
    assert.equal(
      met(
        "progress",
        "next",
        ctx(PPT_PROGRESS_TEMPLATE.replace("Next step:", "Next step: ship it")),
      ),
      true,
    );
  });

  it("accepts a forward-looking sentence with no heading at all", () => {
    assert.equal(
      met(
        "progress",
        "next",
        ctx("Spawn logic is done; next I'll wire payouts."),
      ),
      true,
    );
  });

  it("never blocks posting on the advisory row", () => {
    const results = evaluateComposerRequirements(
      "progress",
      ctx(`${PPT_PROGRESS_TEMPLATE} rebuilt the spawn logic`),
    );
    assert.deepEqual(unmetRequired(results), []);
  });
});

describe("describeUnmet", () => {
  it("is empty when nothing is blocking", () => {
    assert.equal(describeUnmet([]), "");
  });

  it("names every blocking row for the aria-live announcement", () => {
    const empty = describeUnmet(
      unmetRequired(evaluateComposerRequirements("proof", ctx(""))),
    );
    // An empty body is short, and `checkProofBody` reports that first — so the
    // announcement asks for the writing, not for evidence to hang off nothing.
    assert.match(empty, new RegExp(`${PROOF_MIN_CHARS}`));

    const written = describeUnmet(
      unmetRequired(evaluateComposerRequirements("proof", ctx(PROSE))),
    );
    assert.match(written, /attach/i);
  });
});

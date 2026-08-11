import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_ASSIST_ACTIONS,
  AI_ASSIST_FIELDS,
  type AiAssistFieldConfig,
  aiAssistField,
  assistEligibility,
  clampAssistOutput,
} from "./ai-assist-config";
import { CAMPAIGN_LIMITS } from "./payout-campaign";
import { PROOF_MIN_CHARS } from "./payout-policy";
import { PPT_COMPOSER_MODES } from "./ppt-composer-config";

const FIELDS = Object.values(AI_ASSIST_FIELDS);

/**
 * The number the table promises has to be the number something else enforces.
 * A rewrite that clears this table and is then truncated by the server is
 * silently mangled text posted to Linear under someone's name.
 */
describe("field ceilings match their real enforcers", () => {
  it("matches the PPT composer caps", () => {
    assert.equal(
      AI_ASSIST_FIELDS.ppt_proof.maxChars,
      PPT_COMPOSER_MODES.proof.maxChars,
    );
    assert.equal(
      AI_ASSIST_FIELDS.ppt_progress.maxChars,
      PPT_COMPOSER_MODES.progress.maxChars,
    );
  });

  it("matches the campaign limits", () => {
    assert.equal(
      AI_ASSIST_FIELDS.campaign_headline.maxChars,
      CAMPAIGN_LIMITS.headline,
    );
    assert.equal(AI_ASSIST_FIELDS.campaign_body.maxChars, CAMPAIGN_LIMITS.body);
  });

  it("matches the server-side truncations for admin notes", () => {
    // ppt-eligibility-actions.ts and ppt-assignment-watch-actions.ts both
    // .slice(0, 1000) before writing.
    assert.equal(AI_ASSIST_FIELDS.ppt_override_justification.maxChars, 1_000);
    assert.equal(AI_ASSIST_FIELDS.assignment_watch_note.maxChars, 1_000);
  });

  it("matches the suggestion note zod cap", () => {
    // task-suggestion-actions.ts: z.string().trim().max(500)
    assert.equal(AI_ASSIST_FIELDS.task_suggestion_note.maxChars, 500);
  });

  it("never lets a proof rewrite be shorter than the payout gate allows", () => {
    assert.ok(AI_ASSIST_FIELDS.ppt_proof.maxChars > PROOF_MIN_CHARS);
    assert.ok(
      AI_ASSIST_FIELDS.ppt_proof.houseStyle.includes(String(PROOF_MIN_CHARS)),
      "the proof house style must name the minimum the gate enforces",
    );
  });
});

describe("table invariants", () => {
  it("keys every entry by its own id", () => {
    for (const [key, config] of Object.entries(AI_ASSIST_FIELDS)) {
      assert.equal(config.id, key);
    }
  });

  it("names every surface so it spends from the writing budget", () => {
    // Mirrors usesWritingBudget() in llm.ts without importing it — that module
    // pulls in Prisma and both provider SDKs.
    for (const config of FIELDS) {
      assert.ok(
        /^write_[a-z_]+$/.test(config.surface),
        `${config.id} has surface "${config.surface}"`,
      );
      if (config.review) {
        assert.ok(
          /^review_[a-z_]+$/.test(config.review.surface),
          `${config.id} has review surface "${config.review.surface}"`,
        );
      }
    }
  });

  it("keeps at most three actions so the row cannot wrap on a phone", () => {
    for (const config of FIELDS) {
      assert.ok(config.actions.length > 0, `${config.id} offers no actions`);
      assert.ok(config.actions.length <= 3, `${config.id} offers too many`);
      assert.equal(
        new Set(config.actions).size,
        config.actions.length,
        `${config.id} repeats an action`,
      );
      for (const action of config.actions) {
        assert.ok(AI_ASSIST_ACTIONS[action], `${action} has no instruction`);
      }
    }
  });

  it("reserves output per field rather than per adapter", () => {
    for (const config of FIELDS) {
      assert.ok(config.maxTokens > 0 && config.maxTokens <= 2_000, config.id);
      assert.ok(config.minInputChars > 0, config.id);
      assert.ok(config.minInputChars < config.maxChars, config.id);
    }
  });

  it("offers the advisory review only where a payout depends on the text", () => {
    const withReview = FIELDS.filter((config) => config.review).map(
      (config) => config.id,
    );
    assert.deepEqual(withReview, ["ppt_proof"]);
  });
});

/**
 * The exclusions are the point of the table, so they are asserted rather than
 * left to a comment. Adding one of these means deciding to send a name, an
 * address, a bank detail or a signed legal statement to a model.
 */
describe("fields that must never offer writing help", () => {
  it("has no entry for KYC, COI, welcome pack, addresses or payment details", () => {
    const forbidden =
      /kyc|coi|conflict|welcome_pack|address|shipping|payment|bank|legal_name|identity/;
    for (const id of Object.keys(AI_ASSIST_FIELDS)) {
      assert.equal(forbidden.test(id), false, `${id} must not be assisted`);
    }
  });

  it("returns null for an unknown field rather than guessing", () => {
    assert.equal(aiAssistField("kyc_rejection_notes"), null);
    assert.equal(aiAssistField("coi_description"), null);
    assert.equal(aiAssistField(""), null);
  });
});

describe("assistEligibility", () => {
  const config = AI_ASSIST_FIELDS.ppt_proof;

  it("spends nothing on a draft that is barely started", () => {
    assert.deepEqual(assistEligibility(config, "fixed it"), {
      ok: false,
      reason: "too_short",
    });
  });

  it("ignores whitespace padding", () => {
    assert.deepEqual(assistEligibility(config, `   ${" ".repeat(200)}   `), {
      ok: false,
      reason: "too_short",
    });
  });

  it("refuses a draft already past the field ceiling", () => {
    assert.deepEqual(assistEligibility(config, "x".repeat(9_000)), {
      ok: false,
      reason: "too_long",
    });
  });

  it("accepts a real draft", () => {
    assert.deepEqual(
      assistEligibility(
        config,
        "Rewrote the bus spawner to reuse the pooled model and verified twenty spawns in Bandar Ledang.",
      ),
      { ok: true },
    );
  });
});

describe("clampAssistOutput", () => {
  const config: AiAssistFieldConfig = {
    ...AI_ASSIST_FIELDS.campaign_headline,
    maxChars: 20,
  };

  it("leaves a reply inside the ceiling alone, minus surrounding space", () => {
    assert.equal(
      clampAssistOutput(config, "  Three times PPT  "),
      "Three times PPT",
    );
  });

  it("never returns more than the ceiling", () => {
    const clamped = clampAssistOutput(config, "a".repeat(40));
    assert.ok(clamped.length <= config.maxChars);
  });

  it("cuts at a word boundary rather than mid-word", () => {
    const clamped = clampAssistOutput(
      config,
      "Triple points on every sprint task",
    );
    assert.equal(clamped, "Triple points on");
  });

  it("falls back to a hard cut when there is no boundary to find", () => {
    const clamped = clampAssistOutput(config, "b".repeat(50));
    assert.equal(clamped.length, config.maxChars);
  });

  it("holds for every configured field", () => {
    for (const field of FIELDS) {
      const clamped = clampAssistOutput(field, "word ".repeat(5_000));
      assert.ok(
        clamped.length <= field.maxChars,
        `${field.id} clamped to ${clamped.length}`,
      );
    }
  });
});

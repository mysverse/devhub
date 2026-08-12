import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";

// The adapter owns DB-backed metering functions, but provider selection does
// not touch the database. Prisma only needs a valid URL for its lazy pool.
let getLlmProviderOrder: typeof import("@/lib/llm")["getLlmProviderOrder"];
let isAssistantConfigured: typeof import("@/lib/llm")["isAssistantConfigured"];
let isFallbackEligible: typeof import("@/lib/llm")["isFallbackEligible"];
let llmFailureKind: typeof import("@/lib/llm")["llmFailureKind"];
let resetLlmClientForTests: typeof import("@/lib/llm")["resetLlmClientForTests"];
let usesWritingBudget: typeof import("@/lib/llm")["usesWritingBudget"];

before(async () => {
  process.env.DATABASE_URL ??=
    "postgresql://postgres:postgres@127.0.0.1:5432/devhub_test_not_connected";
  ({
    getLlmProviderOrder,
    isAssistantConfigured,
    isFallbackEligible,
    llmFailureKind,
    resetLlmClientForTests,
    usesWritingBudget,
  } = await import("@/lib/llm"));
});

const KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "LLM_PROVIDER",
  "LLM_FALLBACK_PROVIDER",
  "LLM_ASSISTANT_ENABLED",
] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetLlmClientForTests();
});

describe("LLM provider selection", () => {
  it("prefers configured OpenAI and keeps one keyed fallback", () => {
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.LLM_PROVIDER = "openai";
    assert.deepEqual(getLlmProviderOrder(), ["openai", "anthropic"]);
  });

  it("can disable fallback explicitly", () => {
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_FALLBACK_PROVIDER = "none";
    assert.deepEqual(getLlmProviderOrder(), ["openai"]);
  });

  it("uses the available provider when the requested provider has no key", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.LLM_PROVIDER = "openai";
    assert.deepEqual(getLlmProviderOrder(), ["anthropic"]);
  });

  it("allows chat to be disabled independently", () => {
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.LLM_ASSISTANT_ENABLED = "false";
    assert.equal(isAssistantConfigured(), false);
  });

  it("uses the configured backup after a provider contract failure", () => {
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_FALLBACK_PROVIDER = "anthropic";

    assert.deepEqual(getLlmProviderOrder(), ["openai", "anthropic"]);
    assert.equal(llmFailureKind({ status: 400 }), "invalid_request");
    assert.equal(isFallbackEligible("invalid_request"), true);
  });

  it("does not route aborts or refusals through another provider", () => {
    assert.equal(isFallbackEligible("aborted"), false);
    assert.equal(isFallbackEligible("refusal"), false);
  });
});

describe("writing budget", () => {
  it("claims the write_ and review_ surfaces and nothing else", () => {
    for (const surface of [
      "write_ppt_proof",
      "write_campaign",
      "review_ppt_proof",
    ]) {
      assert.equal(usesWritingBudget(surface), true, surface);
    }
  });

  it("keeps chat off the writing ledger too", () => {
    // Chat is gated by turns, so it belongs to neither per-user call budget.
    assert.equal(usesWritingBudget("assistant_chat"), false);
  });

  it("leaves every existing surface on the default ledger", () => {
    // If one of these ever started spending from the writing budget, the cap
    // that protects drafting would be silently measuring the wrong thing.
    for (const surface of [
      "ppt_draft",
      "task_ideas",
      "task_reason",
      "assistant_chat",
      "proof_review",
      "bonus_month_summary",
      "week_summary",
      "search_intent",
    ]) {
      assert.equal(usesWritingBudget(surface), false, surface);
    }
  });
});

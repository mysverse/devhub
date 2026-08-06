import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";

// The adapter owns DB-backed metering functions, but provider selection does
// not touch the database. Prisma only needs a valid URL for its lazy pool.
let getLlmProviderOrder: typeof import("@/lib/llm")["getLlmProviderOrder"];
let isAssistantConfigured: typeof import("@/lib/llm")["isAssistantConfigured"];
let resetLlmClientForTests: typeof import("@/lib/llm")["resetLlmClientForTests"];

before(async () => {
  process.env.DATABASE_URL ??=
    "postgresql://postgres:postgres@127.0.0.1:5432/devhub_test_not_connected";
  ({ getLlmProviderOrder, isAssistantConfigured, resetLlmClientForTests } =
    await import("@/lib/llm"));
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
});

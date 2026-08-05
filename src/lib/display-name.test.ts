import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type DisplayNameInput,
  resolveDisplayName,
  resolveDisplayNameOrNull,
} from "./display-name";
import type { LinearAssigneeDTO } from "./linear-queries";

test("preferredName wins over every other candidate", () => {
  assert.equal(
    resolveDisplayName({
      profile: { preferredName: "Alex", user: { name: "Alex Developer" } },
      linear: { displayName: "alexd", name: "Alexander" },
      storedLinearName: "alexd",
    }),
    "Alex",
  );
});

test("a blank preferredName falls through to the OAuth name", () => {
  assert.equal(
    resolveDisplayName({
      profile: { preferredName: "   ", user: { name: "Ravi Scripter" } },
    }),
    "Ravi Scripter",
  );
});

test("the DevHub OAuth name outranks the Linear workspace handle", () => {
  assert.equal(
    resolveDisplayName({
      profile: { preferredName: null, user: { name: "Mei Mesher" } },
      linear: { displayName: "meim" },
    }),
    "Mei Mesher",
  );
});

test("a Linear-only identity resolves displayName then name", () => {
  assert.equal(
    resolveDisplayName({ linear: { displayName: "balab" } }),
    "balab",
  );
  assert.equal(
    resolveDisplayName({ linear: { displayName: null, name: "Bala Builder" } }),
    "Bala Builder",
  );
});

test("a denormalized Linear name is used when nothing live is available", () => {
  assert.equal(
    resolveDisplayName({ profile: null, storedLinearName: "alexd" }),
    "alexd",
  );
});

test("an empty input falls back, and the fallback is overridable", () => {
  assert.equal(resolveDisplayName({}), "Developer");
  assert.equal(
    resolveDisplayName({ profile: { preferredName: null } }),
    "Developer",
  );
  assert.equal(resolveDisplayName({ fallback: "a developer" }), "a developer");
});

test("legalName and email are never display candidates", () => {
  // The public type forbids these fields; the cast simulates a caller that
  // smuggles them in anyway (e.g. spreading a whole Prisma row).
  const smuggled = {
    profile: {
      preferredName: null,
      legalName: "Alexander Tan Wei Ming",
      email: "developer@devhub.mock",
      user: { name: null, email: "developer@devhub.mock" },
    },
  } as unknown as DisplayNameInput;

  assert.equal(resolveDisplayName(smuggled), "Developer");
});

test("resolveDisplayNameOrNull yields null rather than a fallback", () => {
  assert.equal(resolveDisplayNameOrNull({}), null);
  assert.equal(
    resolveDisplayNameOrNull({ profile: { preferredName: "Aina" } }),
    "Aina",
  );
});

test("LinearAssigneeDTO satisfies the linear input shape", () => {
  const assignee: LinearAssigneeDTO = {
    id: "linear-user-alex",
    name: "Alexander",
    displayName: "alexd",
    avatarUrl: null,
  };

  assert.equal(resolveDisplayName({ linear: assignee }), "alexd");
});

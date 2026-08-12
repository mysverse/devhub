import assert from "node:assert/strict";
import { test } from "node:test";
import { notFound, redirect } from "next/navigation";
import {
  loadOptionalSection,
  loadSection,
  sectionData,
  sectionDetail,
} from "./section-result";

test("a section that loads returns its data", async () => {
  const result = await loadSection("pending payouts", async () => [1, 2, 3]);
  assert.deepEqual(result, { ok: true, data: [1, 2, 3] });
  assert.deepEqual(sectionData(result, []), [1, 2, 3]);
  assert.equal(sectionDetail(result), null);
});

test("a section that throws degrades with the cause", async () => {
  const result = await loadSection("pending payouts", async () => {
    throw Object.assign(new Error("worker exceeded resources"), {
      code: "P6000",
    });
  });

  assert.equal(result.ok, false);
  assert.equal(sectionDetail(result), "P6000");
  assert.deepEqual(sectionData(result, []), []);
});

test("redirect() is control flow, not a failure, and must escape", async () => {
  // Caught instead of rethrown, this renders the page the caller was trying to
  // navigate away from — an auth redirect becomes a silently-served page.
  await assert.rejects(
    loadSection("admin status", async () => redirect("/onboarding")),
    (error: unknown) =>
      (error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT") ===
      true,
  );
});

test("notFound() must escape too", async () => {
  await assert.rejects(
    loadSection("document", async () => notFound()),
    (error: unknown) =>
      (error as { digest?: string }).digest?.includes("HTTP_ERROR_FALLBACK") ===
      true,
  );
});

test("loadOptionalSection returns the fallback on failure", async () => {
  const banner = await loadOptionalSection(
    "campaign banner",
    async () => {
      throw new Error("down");
    },
    null,
  );
  assert.equal(banner, null);

  const live = await loadOptionalSection(
    "campaign banner",
    async () => "3x",
    null,
  );
  assert.equal(live, "3x");
});

test("loadOptionalSection still lets control flow escape", async () => {
  await assert.rejects(
    loadOptionalSection(
      "admin status",
      async () => redirect("/sign-in"),
      false,
    ),
  );
});
